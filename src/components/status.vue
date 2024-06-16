<template>
  <div @mouseover="hover = true" @mouseleave="hover = false">
    <div v-if="sot.status == 'busy'" id="spinner"></div>
    <div v-if="sot.status == 'ok' && hover == false" id="checkmark"></div>
    <div v-if="sot.status == 'ok' && hover == true" @click="sot.get(sot.title)" class="refresh icon"></div>
    <div v-if="sot.status == 'error' && hover == false" class="close icon"></div>
    <div v-if="sot.status == 'error' && hover == true" @click="sot.get(sot.title)" class="refresh icon"></div>
  </div>
</template>

<script>
export default {
  name: 'status',
  data: function() {
    return {
      sot: this.$root.$data,
      hover: false
    }
  },
}
</script>

<style scoped lang="scss">
@import "../assets/settings.scss";

#spinner {
	display: inline-block;
  border: 2px solid;
  border-color: $color-inactive;
  border-top: 2px solid $color-bg;
  border-radius: 50%;
  width: 15px;
  height: 15px;
  animation: spin 0.5s linear infinite;
  margin-top: 13px;
  margin-right: 1px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

#checkmark {
  display: inline-block;
  width: 8px;
  height: 16px;
  border: solid;
  border-color: $color-primary;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: 10px;
  margin-right: 6px;
}

.refresh.icon {
  color: $color-primary;
  position: absolute;
  margin-left: -19px;
  margin-top: 13px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border-top: solid 2px currentColor;
  border-bottom: solid 2px currentColor;
  border-left: solid 2px transparent;
  border-right: solid 2px currentColor;
}
.refresh.icon:before {
  content: '';
  position: absolute;
  left: 0px;
  top: 11px;
  width: 3px;
  height: 3px;
  border-top: solid 2px currentColor;
  border-left: solid 2px currentColor;
  -webkit-transform: rotate(-22.5deg);
          transform: rotate(-22.5deg);
}

.close.icon {
  display: inline-block;
  color: $color-alert;
  width: 21px;
  height: 21px;
  position: relative;
  margin-top: 5px;
}
.close.icon:before {
  content: '';
  position: absolute;
  top: 16px;
  width: 21px;
  height: 2px;
  background-color: currentColor;
  -webkit-transform: rotate(-45deg);
          transform: rotate(-45deg);
}
.close.icon:after {
  content: '';
  position: absolute;
  top: 16px;
  width: 21px;
  height: 2px;
  background-color: currentColor;
  -webkit-transform: rotate(45deg);
          transform: rotate(45deg);
}

</style>
