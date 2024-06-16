<template>
  <div>
    <logo/>
    <br>
    Terms of Service<br>
    <br>
    By using the publicnote app or web app (“Service”), you are agreeing to be bound by the following terms and conditions (“Terms of Use”) set forth by publicnote.com (“We”).  And when I say "We" I'm talking about me and my dog.<br>
    <br>
    I. We are not responsible for any information stored with the Service.<br>
    <br>
    II. We reserve the right to modify or terminate the Service for any reason, without notice at any time.<br>
    <br>
    III. We reserve the right to alter these terms at any time.<br>
    <br>
    IV. We reserve the right to refuse service to anyone for any reason at any time.<br>
    <br>
    V. Woof woof woof woof woof.<br>
    <br>
    <div class="link" @click="sot.title=''">home</div>
    <br><br>
  </div>
</template>

<script>
import logo from './logo.vue'
export default {
  name: 'terms',
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

</style>
