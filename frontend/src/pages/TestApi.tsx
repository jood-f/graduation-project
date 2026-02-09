import { useEffect } from "react";
import { apiGet } from "@/lib/api";

export default function TestApi() {
  useEffect(() => {
    apiGet("/sites")
      .then((data) => console.log("Sites:", data))
      .catch((err) => console.error("Error:", err));
  }, []);

  return (
    <div>
      <h1>Testing API</h1>
      <p>Check the console 👀</p>
    </div>
  );
}
