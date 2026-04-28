"""
RESET: DRS & Actions Only
─────────────────────────
Clears action requests, ledger transactions, and action configs.
Resets team wallet balances and total runs to defaults.
Clears related Firebase Realtime DB nodes.
Re-seeds default ActionConfig entries.

Use this when DRS / action limits hit a glitch and you need a clean
slate WITHOUT destroying users, orgs, events, or teams.

Usage:
    cd backend
    python reset_drs_actions.py
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, select, delete
from sqlalchemy import text
from app.db.base import engine
from app.models.action_request import ActionRequest, ActionType
from app.models.action_config import ActionConfig
from app.models.ledger import LedgerTransaction
from app.models.team import Team
from app.models.event import Event
from app.core.firebase import get_firebase_app
from firebase_admin import db as firebase_db


def migrate_schema():
    """Ensure the DB schema is up-to-date (add columns introduced after initial deploy)."""
    with engine.connect() as conn:
        # message column added for participant → umpire notes on action requests
        conn.execute(text(
            "ALTER TABLE action_requests ADD COLUMN IF NOT EXISTS message VARCHAR(500)"
        ))
        conn.commit()
    print("[Schema] ✅ Verified action_requests.message column exists")


DEFAULT_WALLET_BALANCE = 1000
DEFAULT_TOTAL_RUNS = 0

# Same defaults used in setup_test_data.py / events.py
ACTION_DEFAULTS = {
    ActionType.DRS: {
        "duration_minutes": 10,
        "point_cost": 10,
        "reward_runs": 10,
        "penalty_runs": -5,
        "first_use_free": False,
        "max_uses_per_team": 2,
    },
    ActionType.STRATEGIC_TIMEOUT: {
        "duration_minutes": 5,
        "point_cost": 10,
        "reward_runs": 0,
        "penalty_runs": 0,
        "first_use_free": True,
        "max_uses_per_team": None,
    },
    ActionType.RETENTION: {
        "duration_minutes": 10,
        "point_cost": 10,
        "reward_runs": 0,
        "penalty_runs": 0,
        "first_use_free": False,
        "max_uses_per_team": 2,
    },
    ActionType.QUICK_SINGLE: {
        "duration_minutes": 10,
        "point_cost": 0,
        "reward_runs": 10,
        "penalty_runs": -10,
        "first_use_free": False,
        "max_uses_per_team": None,
    },
}


def clear_firebase_action_nodes():
    """Wipe /action_requests and /teams nodes from Firebase RTDB."""
    try:
        get_firebase_app()
        print("\n[Firebase] Clearing /action_requests ...")
        firebase_db.reference("/action_requests").delete()

        print("[Firebase] Clearing /teams (will be re-pushed on next sync) ...")
        firebase_db.reference("/teams").delete()

        print("[Firebase] ✅ Done")
    except Exception as e:
        print(f"[Firebase] ⚠️  Could not clear RTDB nodes (non-fatal): {e}")


def reset_actions():
    print("=" * 60)
    print("  🏏 CRICKATHON — DRS & ACTION RESET")
    print("=" * 60)

    confirm = input(
        "\n⚠️  This will DELETE all action requests, ledger entries, and "
        "action configs,\n   then reset team wallets/runs and re-seed "
        "default configs.\n\n   Users, orgs, events, and teams are KEPT.\n\n"
        "   Type 'yes' to continue: "
    )
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        return

    # ── 0. Ensure schema is up-to-date ─────────────────────────────────
    migrate_schema()

    with Session(engine) as session:
        # ── 1. Delete action_requests ──────────────────────────────────
        count = len(session.exec(select(ActionRequest)).all())
        session.exec(delete(ActionRequest))
        session.commit()
        print(f"\n[PostgreSQL] 🗑  Deleted {count} action request(s)")

        # ── 2. Delete ledger_transactions ──────────────────────────────
        count = len(session.exec(select(LedgerTransaction)).all())
        session.exec(delete(LedgerTransaction))
        session.commit()
        print(f"[PostgreSQL] 🗑  Deleted {count} ledger transaction(s)")

        # ── 3. Delete action_configs ───────────────────────────────────
        count = len(session.exec(select(ActionConfig)).all())
        session.exec(delete(ActionConfig))
        session.commit()
        print(f"[PostgreSQL] 🗑  Deleted {count} action config(s)")

        # ── 4. Reset team wallet_balance and total_runs ────────────────
        teams = session.exec(select(Team)).all()
        for team in teams:
            team.wallet_balance = DEFAULT_WALLET_BALANCE
            team.total_runs = DEFAULT_TOTAL_RUNS
            session.add(team)
        session.commit()
        print(f"[PostgreSQL] 🔄 Reset {len(teams)} team(s) → wallet={DEFAULT_WALLET_BALANCE}, runs={DEFAULT_TOTAL_RUNS}")

        # ── 5. Re-seed ActionConfig defaults for every event ───────────
        events = session.exec(select(Event)).all()
        seed_count = 0
        for event in events:
            for action_type, cfg in ACTION_DEFAULTS.items():
                config = ActionConfig(
                    event_id=event.event_id,
                    action_type=action_type,
                    **cfg,
                )
                session.add(config)
                seed_count += 1
        session.commit()
        print(f"[PostgreSQL] 🌱 Re-seeded {seed_count} action config(s) across {len(events)} event(s)")

    # ── 6. Clear Firebase RTDB action nodes ────────────────────────────
    clear_firebase_action_nodes()

    print("\n" + "=" * 60)
    print("  ✅ DRS & ACTION RESET COMPLETE")
    print("=" * 60)
    print("  • Action requests, ledger, and configs wiped")
    print("  • Team wallets and runs reset to defaults")
    print("  • ActionConfig defaults re-seeded for all events")
    print("  • Firebase RTDB /action_requests + /teams cleared")
    print("=" * 60)


if __name__ == "__main__":
    reset_actions()
