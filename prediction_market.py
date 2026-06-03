# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json
import typing


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


# Match status values
STATUS_OPEN = "open"            # predictions accepted
STATUS_RESOLVED = "resolved"    # outcome decided, winners can claim
STATUS_REFUNDING = "refunding"  # postponed or all-correct — everyone refunds

# Valid prediction picks
PICK_HOME = "home"
PICK_DRAW = "draw"
PICK_AWAY = "away"


class PredictionMarket(gl.Contract):
    # Match metadata (set in constructor, immutable after)
    team1: str                       # home team
    team2: str                       # away team
    game_date: str                   # YYYY-MM-DD
    resolution_url: str              # BBC Sport URL for this date
    admin: Address                   # only address allowed to call mark_postponed

    # Match state
    status: str                      # 'open' | 'resolved' | 'refunding'
    result: str                      # 'home' | 'draw' | 'away' | '' if not yet resolved
    final_score: str                 # e.g. '2:1', for display

    # Pari-mutuel pools (in wei)
    pool_home: u256
    pool_draw: u256
    pool_away: u256

    # Per-user state
    picks: TreeMap[Address, str]      # user -> pick
    stakes: TreeMap[Address, u256]    # user -> stake amount
    claimed: TreeMap[Address, bool]   # user -> has claimed/refunded yet

    # Minimum stake (2 GEN)
    MIN_STAKE: u256

    def __init__(self, team1: str, team2: str, game_date: str):
        """
        Initialize a single-match prediction market.

        Args:
            team1: Home team name (exact BBC Sport spelling)
            team2: Away team name (exact BBC Sport spelling)
            game_date: YYYY-MM-DD format
        """
        self.team1 = team1
        self.team2 = team2
        self.game_date = game_date
        self.resolution_url = (
            "https://www.bbc.com/sport/football/scores-fixtures/" + game_date
        )
        self.admin = gl.message.sender_address

        self.status = STATUS_OPEN
        self.result = ""
        self.final_score = ""

        self.pool_home = u256(0)
        self.pool_draw = u256(0)
        self.pool_away = u256(0)

        self.MIN_STAKE = u256(2_000_000_000_000_000_000)  # 2 GEN

    # ------------------------------------------------------------ PREDICTIONS

    @gl.public.write.payable
    def submit_prediction(self, pick: str) -> None:
        """User submits a pick with stake (>= 2 GEN). One prediction per user."""
        if self.status != STATUS_OPEN:
            raise gl.vm.UserError("predictions closed")

        if pick != PICK_HOME and pick != PICK_DRAW and pick != PICK_AWAY:
            raise gl.vm.UserError("pick must be 'home', 'draw', or 'away'")

        value = gl.message.value
        if value < self.MIN_STAKE:
            raise gl.vm.UserError("minimum stake is 2 GEN")

        sender = gl.message.sender_address
        if sender in self.picks:
            raise gl.vm.UserError("already predicted this match")

        self.picks[sender] = pick
        self.stakes[sender] = value

        if pick == PICK_HOME:
            self.pool_home = self.pool_home + value
        elif pick == PICK_DRAW:
            self.pool_draw = self.pool_draw + value
        else:
            self.pool_away = self.pool_away + value

    # ------------------------------------------------------------ RESOLUTION

    @gl.public.write
    def resolve(self) -> typing.Any:
        """Resolve the match by fetching final score from BBC Sport via LLM consensus."""
        if self.status != STATUS_OPEN:
            raise gl.vm.UserError("match is not open for resolution")

        # Capture self values into locals for the closure
        resolution_url = self.resolution_url
        team1 = self.team1
        team2 = self.team2

        def get_match_result() -> typing.Any:
            web_data = gl.nondet.web.render(resolution_url, mode="text")

            task = f"""
In the following web page, find the final score of the match between:
Team 1 (home): {team1}
Team 2 (away): {team2}

Web page content:
{web_data}
End of web page data.

Use the result at the end of 90 minutes regulation time only.
For knockout matches that went to extra time or penalties, still use the
score at end of 90 minutes regulation.

If it says "Kick off [time]" between the team names, the match hasn't started.
If you cannot find the final score, assume the match is not yet resolved.

Respond ONLY with the following JSON format, nothing else:
{{
    "score": str,    // The final score, e.g. "2:1", or "-" if not resolved
    "winner": int    // 1 if {team1} won, 2 if {team2} won, 0 for draw, -1 if not resolved
}}
Your response must be parseable JSON with no prefix or suffix.
"""
            result = (
                gl.nondet.exec_prompt(task).replace("```json", "").replace("```", "")
            )
            return json.loads(result)

        result_json = gl.eq_principle.strict_eq(get_match_result)

        winner = result_json["winner"]
        if winner < 0:
            # Match not yet finished — leave status as OPEN, can retry later
            return result_json

        # Map winner number to pick string
        if winner == 1:
            self.result = PICK_HOME
        elif winner == 2:
            self.result = PICK_AWAY
        else:
            self.result = PICK_DRAW

        self.final_score = result_json["score"]

        # ---- Determine winning pool ----
        if self.result == PICK_HOME:
            winning_pool = self.pool_home
        elif self.result == PICK_DRAW:
            winning_pool = self.pool_draw
        else:
            winning_pool = self.pool_away

        total_pool = self.pool_home + self.pool_draw + self.pool_away

        # ---- Edge cases that trigger refund path (Option X) ----
        # (a) Nobody picked correctly — refund everyone
        # (b) Everyone picked correctly (100% of pool is on winning side) — refund everyone
        if winning_pool == u256(0) or winning_pool == total_pool:
            self.status = STATUS_REFUNDING
        else:
            self.status = STATUS_RESOLVED

        return result_json

    # ------------------------------------------------------------ CLAIM

    @gl.public.write
    def claim(self) -> None:
        """Winning predictor claims their pari-mutuel share."""
        if self.status != STATUS_RESOLVED:
            raise gl.vm.UserError("match not in claimable state")

        sender = gl.message.sender_address
        if sender not in self.picks:
            raise gl.vm.UserError("no prediction to claim")

        if self.claimed.get(sender, False):
            raise gl.vm.UserError("already claimed")

        # Mark claimed FIRST (reentrancy safety, matches our smoke test pattern)
        self.claimed[sender] = True

        # If user picked wrong, claim is a no-op (just marks as settled)
        if self.picks[sender] != self.result:
            return

        # Pari-mutuel payout: stake * (total_pool / winning_pool)
        if self.result == PICK_HOME:
            winning_pool = self.pool_home
        elif self.result == PICK_DRAW:
            winning_pool = self.pool_draw
        else:
            winning_pool = self.pool_away

        total_pool = self.pool_home + self.pool_draw + self.pool_away
        stake = self.stakes[sender]
        payout = u256((stake * total_pool) // winning_pool)

        _Recipient(sender).emit_transfer(value=payout)

    # ------------------------------------------------------------ REFUND

    @gl.public.write
    def mark_postponed(self) -> None:
        """Admin marks match postponed/cancelled. Switches to refund path."""
        if gl.message.sender_address != self.admin:
            raise gl.vm.UserError("admin only")
        if self.status != STATUS_OPEN:
            raise gl.vm.UserError("can only postpone matches that are still open")
        self.status = STATUS_REFUNDING

    @gl.public.write
    def refund(self) -> None:
        """User reclaims their original stake when match is in refunding state."""
        if self.status != STATUS_REFUNDING:
            raise gl.vm.UserError("refunds not available")

        sender = gl.message.sender_address
        if sender not in self.stakes:
            raise gl.vm.UserError("no prediction to refund")

        if self.claimed.get(sender, False):
            raise gl.vm.UserError("already refunded")

        self.claimed[sender] = True
        stake = self.stakes[sender]
        _Recipient(sender).emit_transfer(value=stake)

    # ------------------------------------------------------------ READ VIEWS

    @gl.public.view
    def get_match_info(self) -> dict[str, typing.Any]:
        return {
            "team1": self.team1,
            "team2": self.team2,
            "game_date": self.game_date,
            "status": self.status,
            "result": self.result,
            "final_score": self.final_score,
            "admin": str(self.admin.as_hex),
        }

    @gl.public.view
    def get_pools(self) -> dict[str, u256]:
        return {
            "home": self.pool_home,
            "draw": self.pool_draw,
            "away": self.pool_away,
            "total": self.pool_home + self.pool_draw + self.pool_away,
        }

    @gl.public.view
    def get_my_prediction(self, user: Address) -> dict[str, typing.Any]:
        if user not in self.picks:
            return {"has_predicted": False}
        return {
            "has_predicted": True,
            "pick": self.picks[user],
            "stake": self.stakes[user],
            "claimed": self.claimed.get(user, False),
        }

    @gl.public.view
    def expected_payout(self, user: Address) -> u256:
        """Hypothetical payout if user's pick wins. UI display helper."""
        if user not in self.picks:
            return u256(0)
        pick = self.picks[user]
        stake = self.stakes[user]
        if pick == PICK_HOME:
            winning_pool = self.pool_home
        elif pick == PICK_DRAW:
            winning_pool = self.pool_draw
        else:
            winning_pool = self.pool_away
        if winning_pool == u256(0):
            return u256(0)
        total_pool = self.pool_home + self.pool_draw + self.pool_away
        return u256((stake * total_pool) // winning_pool)

    @gl.public.view
    def get_contract_balance(self) -> u256:
        return self.balance
