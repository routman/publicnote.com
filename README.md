# publicnote.com
Public Encrypted Notepad

Publicnote is a free online notepad. Enter any title to create a new note or to access any existing note. No account is required.

All notes are auto-saved to the cloud as you type. The checkmark in the upper right corner indicates when a note has been successfully saved.

## How it works

Every note is encrypted with AES-256, using the title as the encryption key. A SHA-256 hash of the title is then used to index the encrypted note in a database. Because SHA-256 is a one-way function and the process happens in your browser, the title is never exposed. Neither the website owner nor the web host (AWS) can view the plaintext contents of any note. The only way to read a note is to know its exact title, so a complex title keeps it private.

```
       title → SHA256 → index
         ⇣
        🔑
note → AES256 → encrypted note
```

By design, there is no way to recover a note if you forget the title.

Titles are case-sensitive: `Example`, `example`, and `EXAMPLE` are different notes.

Notes can be up to 100,000 characters (about 100 KB).

## Public or private notes

Notes can be public or private depending on the complexity of the title:

- Simple titles create public notes that anyone who stumbles on them can view and edit.
- Complex titles create private, anonymous notes that are securely encrypted.

The more complex the title, the stronger the effective privacy.

Using common words as the title is for entertainment purposes only. You will find a variety of messages left by others. If you find something offensive, please delete it.

**Do not use publicnote to store sensitive information.**

## Use cases

- Share ideas publicly
- Keep private notes with complex titles
- Quick text sharing, like a disposable Pastebin
- Puzzles and riddles
- Jokes and memes
- ASCII art
- Anonymous conversations
- Advertising or announcements
- Anonymous dead drops
- Collaborative storytelling
- Wasting time

## Open source and ad-free

Publicnote is an [open-source](https://github.com/routman/publicnote.com) project and is 100% ad-free.

Your donations help fund operating costs and are greatly appreciated.

- Bitcoin: `bc1q7fqwmtq2vaka8wwpjpnmlehe36qrgfmlw33vh9`
- Litecoin: `LYMSJ313xJaUsAmucuYRkVJmGB8Ut9VDz8`
- Dogecoin: `DATumCTp1QBG1Gpa3ko6bXPXccnFMFDgYC`
- Ethereum: `0x6abD6f3df07c06e4137269D7187661dE37441218`

## Terms

By using publicnote, you agree to the following:

1. We are not responsible for any information stored with the service.
2. We reserve the right to modify or terminate the service for any reason, without notice at any time.
3. We reserve the right to alter these terms at any time.
4. We reserve the right to refuse service to anyone for any reason at any time.
5. Woof woof woof woof woof.

## FAQ

**What is Publicnote?**
A free, encrypted online notepad. No account needed.

**How do I create a note?**
Enter any title. If the note does not exist, you get a blank note. If it already exists, you can edit it.

**How do I save a note?**
Notes autosave as you type. The green checkmark means the note was saved successfully.

**Can I recover a note if I forget the title?**
No. The title is the encryption key. Without it, the note cannot be recovered.

**Are titles case-sensitive?**
Yes.

**What is the character limit?**
100,000 characters.

**What does the status icon mean?**
A green checkmark means the note loaded or saved successfully. A red X means it failed. An exclamation mark means the note was changed elsewhere and the server has a newer copy — hover to reveal a refresh icon, then click it to load the newer version.

**What is the eye icon for?**
It toggles the title between hidden and visible, like a password field.

**Is Publicnote anonymous?**
Yes. No account, no personal information, just titles.

**Can I store sensitive information?**
We recommend that you do not. Security depends on title complexity.

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
