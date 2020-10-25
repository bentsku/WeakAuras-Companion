<template>
  <div>
    {{ config.wowpath.value }}
  </div>
</template>

<script>
export default {
  name: "TestConfig",
  props: ["config"],
  data() {
    return {
      normalizedData: {},
    };
  },
  mounted() {},
};
</script>
