"""
RESET: Full Database (Nuclear Option)
─────────────────────────────────────
Drops ALL tables and recreates them from scratch.
Clears the ENTIRE Firebase Realtime Database.
Re-runs seed_users.py and setup_test_data.py to restore a clean state.

⚠️  This destroys EVERYTHING: users, orgs, events, teams, actions, ledger.
    Firebase Auth users are NOT deleted (only RTDB data is cleared).

Usage:
    cd backend
    python reset_full_database.py
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

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
        print("[Firebase RTDB] ✅ Done — all nodes cleared")
    except Exception as e:
        print(f"[Firebase RTDB] ⚠️  Could not clear RTDB (non-fatal): {e}")


def reset_full():
    print("=" * 60)
    print("  🏏 CRICKATHON — FULL DATABASE RESET")
    print("=" * 60)

    confirm = input(
        "\n🚨 WARNING: This will DESTROY all data!\n"
        "   • PostgreSQL: ALL tables dropped and recreated\n"
        "   • Firebase RTDB: ALL nodes deleted\n"
        "   • Then seed_users + setup_test_data will be re-run\n"
        "\n   Firebase Auth accounts are NOT deleted.\n"
        "\n   Type 'RESET' (all caps) to continue: "
    )
    if confirm.strip() != "RESET":
        print("Aborted.")
        return

    # ── 1. Drop all tables ─────────────────────────────────────────────
    print("\n[PostgreSQL] Dropping all tables ...")
    SQLModel.metadata.drop_all(engine)
    print("[PostgreSQL] ✅ All tables dropped")

    # ── 2. Recreate all tables ─────────────────────────────────────────
    print("[PostgreSQL] Recreating all tables ...")
    SQLModel.metadata.create_all(engine)
    print("[PostgreSQL] ✅ All tables recreated")

    # ── 3. Clear Firebase RTDB ─────────────────────────────────────────
    clear_entire_firebase_rtdb()

    # ── 4. Re-seed users (Firebase Auth + PostgreSQL) ──────────────────
    print("\n[Seed] Running seed_users ...")
    print("-" * 40)
    from seed_users import seed_test_users
    seed_test_users()

    # ── 5. Re-seed test data (org, event, teams, configs) ──────────────
    print("\n[Seed] Running setup_test_data ...")
    print("-" * 40)
    from setup_test_data import setup
    setup()

    print("\n" + "=" * 60)
    print("  ✅ FULL DATABASE RESET COMPLETE")
    print("=" * 60)
    print("  • All PostgreSQL tables dropped & recreated (incl. message column)")
    print("  • Firebase RTDB wiped clean")
    print("  • Users re-seeded (Firebase Auth + DB)")
    print("  • Org, Event, Teams, ActionConfigs re-seeded")
    print("=" * 60)
    print("\n  Test accounts:")
    print("    superadmin@crickathon.com  |  TestPassword123!")
    print("    admin@crickathon.com       |  TestPassword123!")
    print("    umpire@crickathon.com      |  TestPassword123!")
    print("    participant@crickathon.com |  TestPassword123!")
    print("=" * 60)


if __name__ == "__main__":
    reset_full()
