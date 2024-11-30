<template>
  <div>
    <logo/>
    <h1>Free, Simple, and Secure Online Notepad for Encrypted Note Sharing</h1>
    <p>Welcome to Publicnote, a free online notepad where you can quickly create, share, and access notes without creating an account. Just enter any title above to get started.</p>

    <h2>Effortless Note Sharing:</h2>
    <p>Publicnote allows you to create notes instantly by simply entering a title above. Choose your note's title wisely:</p>
    <ul>
      <li>Public Notes: Short, simple titles create public notes that anyone can view and edit.</li>
      <li>Private Notes: Longer, more complex titles ensure your notes remain private and securely encrypted.</li>
    </ul>
    <p>Don't forget your note's title - it acts as your key! Without it, your note cannot be recovered.</p>

    <h2>Fun and Practical Use Cases:</h2>
    <ul>
      <li>Share Ideas: Post your thoughts for the world to see.</li>
      <li>Private Notes: Keep personal notes secure by using complex titles.</li>
      <li>Quick Text Sharing: Use it like a Pastebin for temporary public text sharing.</li>
      <li>Puzzles and Riddles: Challenge users with fun brain teasers.</li>
      <li>Jokes: Share some laoughts through jokes and memes.</li>
      <li>ASCII Art: Get creative with text-based art.</li>
      <li>Anonymous Conversations: Chat with strangers using public notes.</li>
      <li>Advertising: Promote events or services with public announcements.</li>
      <li>Anonymous Dead Drops: Share information securely and anonymously.</li>
      <li>Collaborative Storytelling: Invite others to contribute to public stories.</li>
      <li>Wasting Time: Entertain yourself with random notes, puzzles, or conversations.</li>
    </ul>

    <h2>How It Works:</h2>

    <p>Publicnote uses <a class="link" href="https://en.wikipedia.org/wiki/Advanced_Encryption_Standard" target="_blank" rel="noopener">AES-256 encryption</a> to secure every note, with the note title as the encryption key. A <a class="link" href="https://en.wikipedia.org/wiki/SHA-2" target="_blank" rel="noopener">SHA-256 hash</a> of the title indexes the note in our database, ensuring no one — including us — can access the plaintext content. Your notes are completely private and secure, unless the title can be easily guessed.</p>
    <br><br>
    <p>Our inspiration comes from the <a class="link" href="https://brainwallet.io" target="_blank" rel="noopener"> Bitcoin brainwallet</a>, which uses passphrases to secure Bitcoin. Publicnote applies the same principle to keep your notes safe. Publicnote is a social experiment designed to observe what happens when notes are made editable by anyone. The project explores collaborative and open-ended note sharing and how users interact within such a system.</p>

    <h2>Open Source and Ad-Free:</h2>

    <p>Publicnote is an <a class="link" href="https://github.com/routman/publicnote.com" target="_blank" rel="noopener">open-source</a> project, offering transparency and community-driven development. We are 100% ad-free, providing a clean, distraction-free environment for creating and sharing your notes. If you enjoy Publicnote, please consider supporting us!</p>

    <h2>Support Publicnote:</h2>

    <p>Help keep Publicnote running through donations:</p>

    <ul>
    <li>Bitcoin: bc1q7fqwmtq2vaka8wwpjpnmlehe36qrgfmlw33vh9</li>
    <li>Litecoin: LYMSJ313xJaUsAmucuYRkVJmGB8Ut9VDz8</li>
    <li>Dogecoin: DATumCTp1QBG1Gpa3ko6bXPXccnFMFDgYC</li>
    <li>Ethereum: 0x6abD6f3df07c06e4137269D7187661dE37441218</li>
    </ul>
    
    <h2>Important Reminder:</h2>
    
    <p>Please do not use Publicnote to store sensitive information. By using our service, you agree to our <div class="link" @click="sot.title = 'terms'">terms and conditions</div>.</p>

    <h2>Frequently Asked Questions (FAQ):</h2>

    <h3>What is Publicnote?</h3>
    <p>Publicnote is a free, secure, and encrypted online notepad that allows you to create, share, and access notes without needing an account.</p>

    <h3>How do I create a new note?</h3>
    <p>Simply enter any title. If the note doesn't exist, you'll see a blank note that you can edit. If it already exists (created by someone else), you're free to edit it.</p>

    <h3>How do I save my note?</h3>
    <p>Notes are autosaved as you type. The green checkmark lets you know when your note has been successfuly saved.</p>

    <h3>Can I recover my notes if I forget the title?</h3>
    <p>No, the title acts as the encryption key. If you forget the title, there is no way to recover the note. Please make sure to remember your note's title, as it cannot be restored without it.</p>

    <h3>Are titles case sensitive?</h3>
    <p>Yes! Capitalized letters result in different notes, so be sure to remember the correct capitalization of your title.</p>

    <h3>What is the character limit for notes?</h3>
    <p>Publicnote allows notes up to 100,000 characters (approximately 100 KB).</p>

    <h3>What does the status icon mean?</h3>
    <p>The status icon helps you monitor your note's status. A green checkmark means he note loaded or saved successfully. A red X means the note failed to save or load.</p>

    <h3>What is the eye icon for?</h3>
    <p>The eye icon allows you to toggle between showing or hiding the title, similar to password fields, to enhance security while accessing your note.</p>

    <h3>How does Publicnote ensure my notes are secure?</h3>
    <p>Publicnote uses AES-256 encryption for all notes, with the note's title serving as the encryption key. A SHA-256 hash of the title indexes the note, ensuring that even we cannot access the content unless the exact title is known.</p>

    <h3>What is the difference between a public and private note?</h3>
    <p>Public notes are created with short, simple titles that anyone can guess, view, or edit. Private notes use longer, more complex titles, making them highly secure and accessible only to those who know the exact title.</p>

    <h3>Do I need an account to use Publicnote?</h3>
    <p>No, Publicnote is completely account-free. You can create and access notes instantly just by entering a title.</p>

    <h3>How long are notes stored on Publicnote?</h3>
    <p>Notes are stored indefinitely, but can be deleted or modified by anyone if they know the title of the note. For private notes, the more complex the title, the less likely someone will accidentally access or alter them.</p>

    <h3>Is Publicnote truly anonymous?</h3>
    <p>Yes, Publicnote does not require any personal information or account creation. Your notes are linked only to the title you create, ensuring your privacy.</p>

    <h3>What are some fun uses of Publicnote?</h3>
    <p>Publicnote can be used for things like sharing jokes, creating riddles, storing private thoughts, anonymous conversations, collaborative storytelling, and more.</p>

    <h3>Can I use Publicnote to store sensitive information?</h3>
    <p>We recommend that you do not use Publicnote to store highly sensitive information. While the service is encrypted, the security of your notes depends on the complexity of the title. Use complex titles for private notes to increase security.</p>

    <h3>Is Publicnote the best free and secure encrypted online notepad?</h3>
    <p>Yes, it is! Publicnote isn't just the best free online notepad ever created - it's one of humanity's greatest achievements.</p>

    <h3>Is Publicnote free to use?</h3>
    <p>Yes, Publicnote is completely free to use, with no hidden costs or ads.</p>

    <br><br>
    <nav>
      <a class="link" rel="alternate" hreflang="en" href="https://publicnote.com/">English</a><br>
      <a class="link" rel="alternate" hreflang="es" href="https://publicnote.com/es/">Español</a><br>
      <a class="link" rel="alternate" hreflang="de" href="https://publicnote.com/de/">Deutsch</a><br>
      <a class="link" rel="alternate" hreflang="ja" href="https://publicnote.com/jp/">日本語</a><br>
    </nav>
    <br>
    <p>publicnote &copy; {{ new Date().getFullYear() }}</p>
  </div>
</template>

<script>
import logo from './logo.vue'
export default {
  name: 'home',
  components: {
    logo
  },
  data: function() {
    return {
      sot: this.$root.$data
    }
  }
}
</script>

<style scoped lang="scss">
@import "../assets/settings.scss";

h1, h2, h3 {
  font-weight: normal;
  font-size: 18px;
  color: var(--color-heading);
}

h2 {
  margin-top: 32px;
}

h3 {
  margin-top: 24px;
  margin-bottom: 8px;
}

p {
  display: inline;
}

li {
  margin-bottom: 8px;
}

</style>
