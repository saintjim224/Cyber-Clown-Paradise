import os


os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./cyberjoker_test.db"
os.environ["OPENAI_ENABLE_REMOTE"] = "false"
os.environ["TESTING"] = "true"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"
os.environ["ADMIN_SECRET_KEY"] = "test-admin-secret"
os.environ["ADMIN_SUPER_HOSTS"] = "127.0.0.1,::1,localhost"
