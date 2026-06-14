# Guide: Fixing the Google "401: invalid_client" Error

To make your Google Login work **Directly** for your thesis (Memoire), follow these steps in the Google Cloud Console.

### 1. Go to Google Cloud Console
Open [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).

### 2. Verify your Client ID
- Look for the **OAuth 2.0 Client IDs** section.
- Open the client named "FireSafe" or similar.
- Copy the **Client ID** and **Client Secret**.
- Open your `.env` file in VSCode and make sure they match EXACTLY:
  ```env
  GOOGLE_CLIENT_ID=your_correct_id_here
  GOOGLE_CLIENT_SECRET=your_correct_secret_here
  ```

### 3. Add the Redirect URI (MOST IMPORTANT)
- Inside the client settings on Google Console, look for **Authorized redirect URIs**.
- Click **Add URI**.
- Copy and paste this EXACT link:
  `http://127.0.0.1:5500/login/google/authorize`
- Click **SAVE**.

### 4. Publish the App
- Go to the **OAuth consent screen** tab on the left.
- If it says "Testing", click **PUBLISH APP**. This allows anyone to log in.

---

## 🛡️ Presentation Safety Mode (Lazem Myhbsch)
If you are at the university and the internet is slow or Google blocks the request:
1. Open `app.py`.
2. Find line 673: `FORCE_BYPASS = False`.
3. Change it to `FORCE_BYPASS = True`.
4. The Google button will now login instantly without needing any internet connection or Google auth.
