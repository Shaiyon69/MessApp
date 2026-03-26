from playwright.sync_api import sync_playwright
import json
import time

def capture_screenshots():
    with sync_playwright() as p:
        # Launch Chromium
        browser = p.chromium.launch(headless=True)
        # We define a wider context
        context = browser.new_context(viewport={"width": 1280, "height": 800})

        # Navigate to set up domain origin
        page = context.new_page()
        page.goto("http://localhost:5173/")
        page.wait_for_timeout(2000) # Wait for page load

        # Screenshot Login
        print("Capturing Login page...")
        page.screenshot(path="public/screenshots/login.png")

        # Inject Dummy Token
        print("Injecting dummy token...")
        dummy_session = {
            "currentSession": {
                "user": {
                    "id": "mock-user-id",
                    "email": "user@example.com"
                }
            }
        }

        # We execute in JS context to set localStorage
        page.evaluate(f"window.localStorage.setItem('sb-dummy-auth-token', JSON.stringify({json.dumps(dummy_session)}));")

        # Also let's try injecting standard supabase auth token just in case
        # For mock.supabase.co, project ref is 'mock'
        standard_session = {
            "user": {
                "id": "mock-user-id",
                "aud": "authenticated",
                "role": "authenticated",
                "email": "user@example.com",
            },
            "access_token": "dummy",
            "refresh_token": "dummy",
            "expires_in": 3600,
            "expires_at": int(time.time()) + 3600,
            "token_type": "bearer"
        }
        page.evaluate(f"window.localStorage.setItem('sb-mock-auth-token', JSON.stringify({json.dumps(standard_session)}));")

        print("Reloading...")
        page.reload()
        page.wait_for_timeout(3000) # Wait for dashboard components to initialize

        print("Capturing Dashboard page...")
        page.screenshot(path="public/screenshots/dashboard.png")

        browser.close()

if __name__ == "__main__":
    capture_screenshots()