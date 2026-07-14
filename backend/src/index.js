import { createApp } from "./app.js";

const port = process.env.PORT || 8080;
const app = createApp();

app.listen(port, () => {
  console.log(`CSV processor API listening on ${port}`);
});
