import Vue from 'vue'
import App from './App.vue'
var CryptoJS = require("crypto-js");

Vue.config.productionTip = false

var controller = null;
var signal = null;

var publicnote = {
  title: '',
  note: '',
  status: '',
  autosave: null,
  autoload: null,
  loading: false,
  get: function(title) {
    if (controller != null) {
      controller.abort();
    }
    publicnote.status = 'busy';
    publicnote.loading = true;
    publicnote.autoload = setTimeout(function() {
      var hash = CryptoJS.SHA256(title).toString();
      var data = {
        id: hash
      }
      controller = new AbortController();
      signal = controller.signal;
      fetch('https://publicnote.com/api/get', {
        signal: signal,
        method: 'POST',
        mode: 'cors',
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify(data)
      })
      .then(function (response) {
        return response.json();
      })
      .then(function (json) {
        var d = JSON.parse(json.body);
        if (d.Item == null) {
          publicnote.note = '';
        }
        else {
          var bytes  = CryptoJS.AES.decrypt(d.Item.ct.toString(), title);
          publicnote.note = bytes.toString(CryptoJS.enc.Utf8);
        }
        publicnote.status = 'ok';
        publicnote.loading = false;
        controller = null;
      })
      .catch(function (error) {
        if (error.toString().search('AbortError') < 0) {
          console.log('error: ' + error);
          publicnote.status = 'error';
        }
      });
    }, 300);
  },
  save: function(title, note) {
    publicnote.status = 'busy';
    clearTimeout(publicnote.autosave);
    publicnote.autosave = setTimeout(function() {
      var hash = CryptoJS.SHA256(title).toString();
      var cypher = CryptoJS.AES.encrypt(note, title).toString();
      var data = {
        "id": hash,
        "ct": cypher
      };
      fetch('https://publicnote.com/api/save', {
        method: 'POST',
        mode: 'cors',
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify(data)
      })
      .then(function (response) {
        return response.json();
      })
      .then(function (json) {
        if (json.body == 'successfully saved') {
          publicnote.status = 'ok';
        }
        else {
          publicnote.status = 'error';
        }
      })
      .catch(function (error) {
        console.log('error saving: ' + error);
        publicnote.status = 'error';
      });
      publicnote.autosave = null;
    }, 2000);
  }
}

new Vue({
  render: function (h) { return h(App) },
  data: publicnote
}).$mount('#app')
