import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: ["node_modules/**", ".next/**"],
  },
  ...coreWebVitals,
];

export default config;
