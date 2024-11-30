<template>
  <div id="app">
    <input ref="title" v-bind:type="[hidden ? 'password' : 'text']"  v-model="sot.title" placeholder="title" v-on:keyup="get()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/>
    <div class="eye icon" v-show="!hidden" @click="hide()"></div>
    <div class="closedeye icon" v-show="hidden" @click="show()"></div>
    <div class="sun icon" @click="dark()"></div>
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
      hidden: true,
      darkmode: true
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
    },
    dark: function() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme); 
    }
  },
  mounted () {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme); // Apply saved theme
    }
    this.$nextTick(() => this.$refs.title.focus());
  }
}
</script>

<style lang="scss">
@import "assets/settings.scss";

html, body {
  font-family: $font;
  font-optical-sizing: auto;
  font-weight: 300;
  font-style: normal;
  font-size: 18px;
  color: var(--color-text);
  background: var(--color-bg);
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

::-webkit-scrollbar {
  width: 12px;
}
::-webkit-scrollbar-thumb {
  background: $color-inactive;
  border-radius: 6px;
  border: 4px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-primary);
  border: 0;
}
::-webkit-resizer {
  display: none;
}
::-webkit-scrollbar-corner {
  display: none;
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
  padding: $app-margin;
  overflow-y: scroll;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
  resize: none;
}

#status {
  position: absolute;
  top: $app-margin + 7px;
  right: $app-margin + 75px;
  user-select: none;
  cursor: pointer;
}

.blur {
  filter:blur(2px);
  background: var(--color-bg);
}

input, textarea {
  display: block;
  font-family: $font;
  color: var(--color-text);
  caret-color: var(--color-primary);
  background: var(--color-bg);
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
  border-bottom: 1px solid var(--color-primary);
  border-width: 0 0 1px 0 ;
  border-image: linear-gradient(to right, var(--color-primary) 0%, var(--color-accent) 100%);
  border-image-slice: 1;
  margin: $app-margin;
  padding: 0 110px 0 0;
  margin-top: $app-margin + 8px;
  margin-bottom: 8px;
}
input:focus {
  border-bottom: 1px solid $color-accent;
  border-width: 0 0 1px 0 ;
  border-image: linear-gradient(to right, var(--color-accent) 0%, var(--color-primary) 100%);
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
  -webkit-overflow-scrolling: touch;
  resize: none;
}

.link {
  display: inline-block;
  cursor: pointer;
  color: var(--color-link);
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
  color: var(--color-primary);
  position: absolute;
  top: 35px;
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
  border: solid 2px var(--color-primary);
}

.closedeye.icon {
  cursor: pointer;
  color: var(--color-primary);
  position: absolute;
  top: 35px;
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
  border: solid 2px var(--color-primary);
}
.closedeye.icon:after {
  content: '';
  position: absolute;
  left: -3px;
  top: 7px;
  width: 24px;
  border: solid 2px currentColor;
  border-width: 2px 0 0 0;
  box-shadow: 0px 2px var(--color-accent);
  -webkit-transform: rotate(90deg);
          transform: rotate(90deg);
}
.sun.icon {
  cursor: pointer;
  color: var(--color-primary);
  position: absolute;
  top: 36px;
  right: $app-margin + 41px;
  width: 7px;
  height: 14px;
  border-radius: 50%;
  border-color: currentColor;
  border-style: solid;
  border-width: 2px 9px 2px 2px;
}
</style>
