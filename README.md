# WebDAV File Explorer

Simple web app to log in to a WebDAV server, browse folders, and download files.

## Features

- Login with WebDAV URL, username, password, and optional base path
- Browse directories
- Breadcrumb navigation and parent folder shortcut
- Download files directly through browser
- Session-based login/logout

## Run

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Notes

- Credentials are stored in server session memory for the active login session.
- For production use, set a strong `SESSION_SECRET` environment variable and run behind HTTPS.
- Public folder visibility is controlled in `server.js`:
  - `PUBLIC_MODE` enables/disables manual login.
  - `PUBLIC_ALLOWED_FOLDERS` controls which root folders are visible and downloadable.
