<template>
  <div id="app">
    <input v-bind:type="[hidden ? 'password' : 'text']"  v-model="sot.title" placeholder="title" v-on:keyup="get()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/>
    <div class="eye icon" v-show="!hidden" @click="hide()"></div>
    <div class="closedeye icon" v-show="hidden" @click="show()"></div>
    <status id="status"/>
    <home class="page" v-if="sot.title == ''"/>
    <terms class="page" v-else-if="sot.title == 'terms'"/>
    <suicide class="page" v-else-if="sot.title.toLowerCase() == 'suicide'"/>
    <about class="page" v-else-if="sot.title == 'about'"/>
    <textarea placeholder="type note here" v-else v-model="sot.note" v-on:keyup="save()" v-bind:class="{blur: sot.loading}" :disabled="sot.loading == true"/>
  </div>
</template>

<script>
import home   from './components/home.vue'
import terms  from './components/terms.vue'
import suicide from './components/suicide.vue'
import about from './components/about.vue'
import status from './components/status.vue'

export default {
  name: 'app',
  components: {
    home, terms, suicide, about, status
  },
  data: function() {
    return {
      sot: this.$root.$data,
      hidden: true
    }
  },
  methods: {
    get: function() {
      clearTimeout(this.sot.autoload);
      clearTimeout(this.sot.autosave);
      if (this.sot.title != '' && this.sot.title != 'terms' && this.sot.title != 'contact' && this.sot.title.toLowerCase() != 'suicide') {
        this.sot.get(this.sot.title);
      }
      else {
        this.sot.note = '';
        this.sot.status = '';
      }
    },
    save: function() {
      this.sot.save(this.sot.title, this.sot.note);
    },
    show: function() {
      this.hidden = false;

    },
    hide: function() {
      this.hidden = true;
    }
  }
}
</script>

<style lang="scss">
@import "assets/settings.scss";

html, body {
  font-family: $font;
  font-size: 18px;
  font-weight: 500;
  color: $color-text;
  background: $color-bg;
  margin: 0;
  width: 100%;
  height: 100%;
}

input::selection {
  background: $color-selection;
}
textarea::selection {
  background: $color-selection;
}

#app {
  width: 100%;
  height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.page {
  flex-grow: 1;
  margin: $app-margin;
  overflow-y: scroll;
  -ms-overflow-style: none;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.page::-webkit-scrollbar {
  display: none;
}

#status {
  position: absolute;
  top: $app-margin + 4px;
  right: $app-margin + 40px;
  user-select: none;
  cursor: pointer;
}

.blur {
  filter:blur(2px);
  background: $color-bg;
}

input, textarea {
  display: block;
  font-family: $font;
  color: $color-text;
  caret-color: $color-primary;
  background: $color-bg;
  font-size: 18px;
  border: none;
  border-radius: 0;
  box-sizing: border-box;
}
input:focus, textarea:focus {
  outline: none;
  border: none;
}

input {
  flex-grow: 0;
  line-height: 40px;
  width: calc(100% - 32px);
  border-bottom: 1px solid $color-primary;
  border-width: 0 0 1px 0 ;
  border-image: linear-gradient(to right, $color-primary 0%, $color-accent 100%);
  border-image-slice: 1;
  margin: $app-margin;
  padding: 0;
  margin-top: $app-margin + 8px;
  margin-bottom: 8px;
}
input:focus {
  border-bottom: 1px solid $color-accent;
  border-width: 0 0 1px 0 ;
  border-image: linear-gradient(to right, $color-accent 0%, $color-primary 100%);
  border-image-slice: 1;
}
::placeholder { 
  color: $color-inactive;
}
textarea {
  flex-grow: 1;
  width: 100%;
  padding: $app-margin;
  line-height: 20px;
  overflow-y: scroll;
  -ms-overflow-style: none;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
textarea::-webkit-scrollbar {
  display: none;
}

.link {
  display: inline-block;
  cursor: pointer;
  color: $color-primary;
}
.nav {
  margin-right: 40px;
  margin-bottom: 16px;
}

a {
  text-decoration: none;
}

.icon {
  user-select: none;
}

.eye.icon {
  cursor: pointer;
  color: $color-primary;
  position: absolute;
  top: 32px;
  right: 20px;
  width: 16px;
  height: 16px;
  border-radius: 77% 16%;
  border: solid 2px currentColor;
  -webkit-transform: rotate(45deg);
          transform: rotate(45deg);
}
.eye.icon:before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: solid 2px $color-primary;
}

.closedeye.icon {
  cursor: pointer;
  color: $color-primary;
  position: absolute;
  top: 32px;
  right: 20px;
  width: 16px;
  height: 16px;
  border-radius: 77% 16%;
  border: solid 2px currentColor;
  -webkit-transform: rotate(45deg);
          transform: rotate(45deg);
}
.closedeye.icon:before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: solid 2px $color-primary;
}
.closedeye.icon:after {
  content: '';
  position: absolute;
  left: -3px;
  top: 7px;
  width: 24px;
  border: solid 2px currentColor;
  border-width: 2px 0 0 0;
  box-shadow: 0px 2px $color-accent;
  -webkit-transform: rotate(90deg);
          transform: rotate(90deg);
}

</style>
