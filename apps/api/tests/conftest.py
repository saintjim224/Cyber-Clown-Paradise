import os


os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./cyberjoker_test.db"
os.environ["OPENAI_ENABLE_REMOTE"] = "false"
os.environ["TESTING"] = "true"
