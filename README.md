# publicnote.com
Public Encrypted Notepad

Publicnote is a free online notepad. Enter any title to create a new note or to access any existing note. No account is required to access publicnote.

All notes are auto-saved to the cloud as you type. The check mark in the upper right corner indicates when a note has been successfully saved.

Every note is encrypted with AES-256, using the title as the encryption key. Then an SHA-256 hash of the title is used to index the encrypted note in a database. Since SHA-256 is a one-way function and the process takes place in your browser, the title is never exposed, thus neither the website owner nor the web host (AWS) can view the plaintext contents of any note (unless the title is easily guessed).

            title → SHA256 → index
              ⇣
             🔑
    note → AES256 → encrypted note

By design, there is no way to recover a note if you forget the title.

Notes stored on publicnote can be public or private, depending on the complexity of the title. Simple titles lead to highly visible notes that can be edited by anyone who stumbles upon them, while complex titles lead to private, anonymous notes that are securely encrypted. The higher the complexity of the title, the stronger the encryption.

Using common words as the title is for entertainment purposes only. You will find a variety of messages left by others. If you find something you find offensive, just delete it.

Do not use publicnote to store sensitive information.

## Development

The frontend is a vanilla JavaScript app built with Vite. A mock backend implementing the get2/save2 API is included for local development.

```
npm install
```

Run the dev server and the mock backend in two terminals:

```
npm run dev       # vite dev server on http://localhost:5173
npm run backend   # mock API on http://localhost:3001
```

The dev server proxies `/api` to the mock backend. If port 3001 is already in use, pick a free port and point the proxy at it:

```
PORT=3101 npm run backend
PUBLICNOTE_API=http://localhost:3101 npm run dev
```

Pass a file path to `npm run backend -- --persist backend/notes.json` to keep notes across restarts.

Run the crypto regression tests (SHA-256 vectors, AES-256-CBC round trips, and an independent decryption of the legacy fixture):

```
npm test
```

Produce a production build in `dist/`:

```
npm run build
```
