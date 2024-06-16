<template>
  <div>
    <logo/>
    <br>
    Publicnote is a free online notepad. Enter any title to create a new note or to access any existing note. No account is required to access publicnote.<br>
    <br>
    Every note is encrypted with AES-256, using the title as the encryption key. Then an SHA-256 hash of the title is used to index the encrypted note in a database. Since SHA-256 is a one-way function and the process takes place in your browser, the title is never exposed, thus neither the website owner nor the web host (AWS) can view the plaintext contents of any note (unless the title is easily guessed).<br>
    <br>
    By design, there is no way to recover a note if you forget the title.<br>
    <br>
    Notes stored on publicnote can be public or private depending on the complexity of the title. Simple titles lead to highly visible notes that can be edited by anyone who stumbles upon them, while complex titles lead to private notes that are securely encrypted. The higher the complexity of the title, the stronger the encryption.<br>
    <br>
    Using common words as the title is for entertainment purposes only. You will find a variety of messages left by others. If you find something you find offensive, just delete it.<br>
    <br>
    Do not use publicnote to store sensitive information.  By using publicnote you are agreeing to our <div class="link" @click="sot.title = 'terms'">terms</div>.<br>
    <br>
    Publicnote is <a class="link" href="https://github.com/routman/publicnote" target="_blank" rel="noopener">open source </a> and offered as a free service without any ads. Your donations help fund operating costs and are greatly appreciated. 🙏<br>
    <br>
    Bitcoin:
    <p class="addr">bc1q7fqwmtq2vaka8wwpjpnmlehe36qrgfmlw33vh9</p>
    Litecoin:
    <p class="addr">LYMSJ313xJaUsAmucuYRkVJmGB8Ut9VDz8</p>
    Dogecoin:
    <p class="addr">DATumCTp1QBG1Gpa3ko6bXPXccnFMFDgYC</p>
    Ethereum:
    <p class="addr">0x6abD6f3df07c06e4137269D7187661dE37441218</p>
    publicnote &copy; {{ new Date().getFullYear() }}<br>
    <br>
    <div class="link" @click="sot.title=''">home</div><br><br>
  </div>
</template>

<script>
import logo from './logo.vue'
export default {
  name: 'about',
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

.addr {
  margin-top: 0px;
}

@media screen and (max-width: 600px) {
  .addr {
    font-size: 16px;
  }
}

@media screen and (max-width: 480px) {
  .addr {
    font-size: 14px;
  }
}

@media screen and (max-width: 400px) {
  .addr {
    font-size: 12px;
  }
}

</style>
