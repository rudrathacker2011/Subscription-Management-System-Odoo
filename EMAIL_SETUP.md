# Email Setup for Revora

The Revora Subscription System relies on environment variables via the `.env` file to handle password resets, notification alerts, invoices, and cron job renewal reminders.

## Required Variables

Open the `.env` file in the root directory and configure the following parameters:

```env
# Example using Gmail App Passwords
EMAIL_FROM="your-email@gmail.com"
EMAIL_PASSWORD="your-16-character-app-password"
```

## How to Get an App Password (Gmail)

If you are using Gmail, standard passwords will not work if Two-Factor Authentication (2FA) is turned on (which is mandatory).

1. Go to your Google Account settings: https://myaccount.google.com/
2. Click on the **Security** tab on the left menu.
3. Ensure **2-Step Verification** is turned On.
4. Search for **App passwords** in the top search bar (or find it under 2-Step verification settings).
5. Add a new App name (e.g., "Revora System").
6. Click **Generate**.
7. Copy the 16-character password provided and paste it into "EMAIL_PASSWORD" in your `.env` file, without spaces.

## Testing the Email

The server runs an initial email connection verification on startup. Check your startup logs.
If the connection is successful, you will see `[EMAIL] Transporter verified successfully.`

If you encounter `Error logging in: Invalid credentials`, please check the App Password generated as mentioned above.
