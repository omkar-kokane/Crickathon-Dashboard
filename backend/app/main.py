from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import organizations, users, events, teams, ledger, action_requests
from app.db.base import create_db_and_tables

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Initializing database schema...")
    create_db_and_tables()
    yield

app = FastAPI(
    title=settings.APP_NAME,
    description="Crickathon Platform API — Real-time hackathon management with cricket mechanics.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(organizations.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(action_requests.router, prefix="/api")

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
