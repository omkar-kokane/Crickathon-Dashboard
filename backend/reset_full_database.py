"""
RESET: Full Database (Nuclear Option)
─────────────────────────────────────
Drops ALL tables and enums, recreates them from scratch.
Clears the ENTIRE Firebase Realtime Database.
Re-runs seed_users.py and setup_test_data.py to restore a clean state.

Usage:
    cd backend
    python reset_full_database.py
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from sqlmodel import SQLModel
from app.db.base import engine
from app.core.firebase import get_firebase_app
from firebase_admin import db as firebase_db

# Import all models so SQLModel.metadata knows every table
import app.models  # noqa


def clear_entire_firebase_rtdb():
    """Wipe ALL data from Firebase Realtime Database."""
    try:
        get_firebase_app()
        print("\n[Firebase RTDB] Wiping entire database ...")
        firebase_db.reference("/").delete()
        print("[Firebase RTDB] Done - all nodes cleared")
    except Exception as e:
        print(f"[Firebase RTDB] Could not clear RTDB (non-fatal): {e}")


def reset_full(force=False):
    print("=" * 60)
    print("  CRICKATHON - FULL DATABASE RESET")
    print("=" * 60)

    if not force:
        confirm = input(
            "\n  WARNING: This will DESTROY all data!\n"
            "   - PostgreSQL: ALL tables and enum types dropped and recreated\n"
            "   - Firebase RTDB: ALL nodes deleted\n"
            "   - Then seed_users + setup_test_data will be re-run\n"
            "\n   Firebase Auth accounts are NOT deleted.\n"
            "\n   Type 'RESET' (all caps) to continue: "
        )
        if confirm.strip() != "RESET":
            print("Aborted.")
            return

    # ── 1. Drop ALL tables and enum types by resetting the public schema ──
    print("\n[PostgreSQL] Dropping public schema (all tables + enums) ...")
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()
    print("[PostgreSQL] Done - schema wiped clean")

    # ── 2. Recreate all tables from SQLModel metadata ─────────────────────
    print("[PostgreSQL] Recreating all tables from models ...")
    SQLModel.metadata.create_all(engine)
    print("[PostgreSQL] Done - all tables recreated")

    # Verify table creation
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        ))
        tables = [r[0] for r in result]
        print(f"[PostgreSQL] Tables: {', '.join(tables)}")

    # ── 3. Clear Firebase RTDB ────────────────────────────────────────────
    clear_entire_firebase_rtdb()

    # ── 4. Re-seed users (Firebase Auth + PostgreSQL) ─────────────────────
    print("\n[Seed] Running seed_users ...")
    print("-" * 40)
    from seed_users import seed_test_users
    seed_test_users()

    # ── 5. Re-seed test data (org, event, teams, configs) ─────────────────
    print("\n[Seed] Running setup_test_data ...")
    print("-" * 40)
    from setup_test_data import setup
    setup()

    # ── 6. Push initial state to Firebase RTDB ────────────────────────────
    print("\n[Firebase Sync] Pushing initial state to RTDB ...")
    try:
        from sqlmodel import Session, select
        from app.models.event import Event
        from app.models.team import Team
        from app.services.firebase_sync import push_event_state, push_team_update

        with Session(engine) as session:
            for event in session.exec(select(Event)).all():
                push_event_state(event)
                print(f"  Pushed event: {event.name}")
            for team in session.exec(select(Team)).all():
                push_team_update(team)
                print(f"  Pushed team: {team.name} (wallet={team.wallet_balance})")
    except Exception as e:
        print(f"  Firebase sync failed (non-fatal): {e}")

    print("\n" + "=" * 60)
    print("  FULL DATABASE RESET COMPLETE")
    print("=" * 60)
    print("  - PostgreSQL schema dropped + recreated (clean enums)")
    print("  - Firebase RTDB wiped clean")
    print("  - Users re-seeded (Firebase Auth + DB)")
    print("  - Org, Event, Teams, ActionConfigs re-seeded")
    print("  - Initial state pushed to Firebase RTDB")
    print("=" * 60)
    print("\n  Test accounts:")
    print("    superadmin@crickathon.com  |  TestPassword123!")
    print("    admin@crickathon.com       |  TestPassword123!")
    print("    umpire@crickathon.com      |  TestPassword123!")
    print("    participant@crickathon.com |  TestPassword123!")
    print("  Default wallet: 100 | Teams: Alpha, Beta")
    print("=" * 60)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()
    reset_full(force=args.force)
