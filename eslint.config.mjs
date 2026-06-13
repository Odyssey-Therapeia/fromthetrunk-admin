import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: ["node_modules/**", ".next/**", "ftt-hr-gmail-workflow/**"],
  },
  ...coreWebVitals,
];

export default config;
