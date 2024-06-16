<template>
  <div>
    <div class="logo accent">public</div>
    <div class="logo">note&nbsp;</div>
  </div>
</template>

<script>
export default {
  name: 'logo'
}
</script>

<style scoped lang="scss">
@import "../assets/settings.scss";

.logo {
  display: inline-block;
  letter-spacing: 3px;
}

.accent {
  color: $color-primary;
  margin-right: 4px;
}
</style>
