import sys
import os

# Ensure the backend dir is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, select
from firebase_admin import auth
from app.core.firebase import get_firebase_app, set_user_role_claim
from app.db.base import engine
from app.models.user import User, UserRole

def seed_test_users():
    get_firebase_app()

    users_to_create = [
        {"email": "superadmin@crickathon.com", "role": UserRole.SUPER_ADMIN},
        {"email": "admin@crickathon.com", "role": UserRole.ADMIN},
        {"email": "umpire@crickathon.com", "role": UserRole.UMPIRE},
        {"email": "participant@crickathon.com", "role": UserRole.PARTICIPANT},
    ]

    password = "TestPassword123!"

    print("--- Starting User Seeding ---")

    with Session(engine) as session:
        for u in users_to_create:
            email = u["email"]
            role = u["role"]
            print(f"\nProcessing {email} ({role.value})...")

            # 1. Firebase Creation
            try:
                fb_user = auth.get_user_by_email(email)
                print("  [Firebase] User already exists.")
            except Exception:
                print("  [Firebase] Creating user...")
                fb_user = auth.create_user(
                    email=email,
                    password=password,
                    email_verified=True
                )
            
            fb_uid = fb_user.uid

            # 2. Assign Firebase Custom Claim
            set_user_role_claim(fb_uid, role.value)
            print("  [Firebase] Role claim set.")

            # 3. PostgreSQL Database Registration
            existing_db = session.exec(select(User).where(User.firebase_uid == fb_uid)).first()
            if existing_db:
                print("  [PostgreSQL] User already in database. Updating role if needed...")
                existing_db.role = role
                session.add(existing_db)
            else:
                print("  [PostgreSQL] Inserting new user record...")
                new_user = User(
                    firebase_uid=fb_uid,
                    email=email,
                    role=role
                )
                session.add(new_user)
            
            session.commit()
            print(f"  [+] Successfully configured {email}")

    print("\n--- Seeding Complete ---")
    print("\nYou can use these accounts to test the platform:")
    for u in users_to_create:
        print(f"Email: {u['email']} | Password: {password} | Role: {u['role'].value}")

if __name__ == "__main__":
    seed_test_users()
