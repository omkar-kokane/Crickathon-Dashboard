"""
Quick setup script: Creates an org, an event, two teams, and assigns the umpire.
Run this after seed_users.py to have a full testable environment.
"""
import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, select
from app.db.base import engine
from app.models.user import User, UserRole
from app.models.event import Event
from app.models.team import Team
from app.models.team_member import TeamMember
from app.models.organization import Organization
import uuid

def setup():
    with Session(engine) as session:
        # --- Find seeded users ---
        admin = session.exec(select(User).where(User.email == "superadmin@crickathon.com")).first()
        admin_normal = session.exec(select(User).where(User.email == "admin@crickathon.com")).first()
        umpire = session.exec(select(User).where(User.email == "umpire@crickathon.com")).first()
        participant = session.exec(select(User).where(User.email == "participant@crickathon.com")).first()

        if not admin or not umpire or not participant:
            print("❌ Run seed_users.py first!")
            return

        # --- Create Organization ---
        existing_org = session.exec(select(Organization).where(Organization.name == "Global Test Org")).first()
        if existing_org:
            org = existing_org
            print(f"[Org] Already exists: {org.name} (ID: {org.org_id})")
        else:
            org = Organization(
                org_id=uuid.uuid4(),
                name="Global Test Org",
            )
            session.add(org)
            session.commit()
            session.refresh(org)
            print(f"[Org] Created: {org.name} (ID: {org.org_id})")

        # --- Assign Org to Users ---
        users_to_update = [admin, admin_normal, umpire, participant]
        for u in users_to_update:
            if u and not u.org_id:
                u.org_id = org.org_id
                session.add(u)
                print(f"[User] Assigned org to {u.email}")
        session.commit()

        # --- Create Event ---
        existing_event = session.exec(select(Event).where(Event.name == "Test Hackathon 2026")).first()
        if existing_event:
            event = existing_event
            if not event.org_id:
                event.org_id = org.org_id
                session.add(event)
                session.commit()
            print(f"[Event] Already exists: {event.name} (ID: {event.event_id})")
        else:
            event = Event(
                event_id=str(uuid.uuid4()),
                org_id=org.org_id,
                name="Test Hackathon 2026",
                current_phase="PRE_MATCH",
            )
            session.add(event)
            session.commit()
            session.refresh(event)
            print(f"[Event] Created: {event.name} (ID: {event.event_id})")

        # --- Create Team Alpha ---
        existing_team1 = session.exec(select(Team).where(Team.name == "Team Alpha")).first()
        if existing_team1:
            team1 = existing_team1
            print(f"[Team] Already exists: {team1.name} (Invite: {team1.invite_code})")
        else:
            team1 = Team(
                team_id=str(uuid.uuid4()),
                event_id=event.event_id,
                name="Team Alpha",
                invite_code="ALPHA2026",
                wallet_balance=1000,
                total_runs=0,
                umpire_id=umpire.user_id,
            )
            session.add(team1)
            session.commit()
            session.refresh(team1)
            print(f"[Team] Created: {team1.name} (Invite: {team1.invite_code})")

        # --- Create Team Beta ---
        existing_team2 = session.exec(select(Team).where(Team.name == "Team Beta")).first()
        if existing_team2:
            team2 = existing_team2
            print(f"[Team] Already exists: {team2.name} (Invite: {team2.invite_code})")
        else:
            team2 = Team(
                team_id=str(uuid.uuid4()),
                event_id=event.event_id,
                name="Team Beta",
                invite_code="BETA2026",
                wallet_balance=1000,
                total_runs=0,
                umpire_id=umpire.user_id,
            )
            session.add(team2)
            session.commit()
            session.refresh(team2)
            print(f"[Team] Created: {team2.name} (Invite: {team2.invite_code})")

        # --- Add participant to Team Alpha ---
        existing_member = session.exec(
            select(TeamMember).where(
                TeamMember.user_id == participant.user_id,
                TeamMember.team_id == team1.team_id,
            )
        ).first()
        if existing_member:
            print(f"[Member] Participant already in Team Alpha")
        else:
            member = TeamMember(
                user_id=participant.user_id,
                team_id=team1.team_id,
            )
            session.add(member)
            session.commit()
            print(f"[Member] Added participant@crickathon.com -> Team Alpha")

        # --- Summary ---
        print("\n" + "=" * 60)
        print("  ORG FIX APPLIED!")
        print("=" * 60)
        print("  All users, events, and teams now have org_id.")

if __name__ == "__main__":
    setup()
