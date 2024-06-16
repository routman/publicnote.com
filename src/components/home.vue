<template>
  <div>
    <logo/>
    <br>
    Enter any title above to access a note. No account required.<br>
    <br>
    Every note is public.  You are free to modify any note you find.<br>
    <br>
    Every note is encrypted.  You must know the title to see the note.<br>
    <br>
    Do not use publicnote to store sensitive information.<br>
    <br>
    <div class="nav link" @click="sot.title = 'about'">about</div>
    <br>
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

</style>
