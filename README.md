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

Publicnote is open source and offered as a free service. Your cryptocurrency donations are appreciated.

BTC: bc1q7fqwmtq2vaka8wwpjpnmlehe36qrgfmlw33vh9

LTC: LYMSJ313xJaUsAmucuYRkVJmGB8Ut9VDz8

DOGE: DATumCTp1QBG1Gpa3ko6bXPXccnFMFDgYC

ETH: 0x6abD6f3df07c06e4137269D7187661dE37441218
