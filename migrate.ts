import { Flyway } from "node-flyway";
import { ENV } from "./src/config/env.js";

const flyway = new Flyway({
  url: ENV.DATABASE_URL,
  user: ENV.DATABASE_USER,
  password: ENV.DATABASE_PASSWORD,
  migrationLocations: ["filesystem:src/db/migrations"] 
});

flyway.info().then(response => {
  if (response.success) {
    // The 'migrations' array contains the status of each script
    console.log("Migration Info:");
    console.table(response.flywayResponse); 
  } else {
    console.error("Failed to retrieve info:", response.error);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
});
