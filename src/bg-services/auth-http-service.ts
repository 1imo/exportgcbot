import express from "express";
import fs from "node:fs";
import path from "node:path";
import { AuthChallengeService } from "../services/auth-challenge-service.js";
import { Logger } from "../utils/logger.js";

export class AuthHttpService {
  private readonly app = express();
  private server?: ReturnType<typeof this.app.listen>;
  private readonly authPageTemplate = fs.readFileSync(path.resolve("assets/websites/auth.html"), "utf8");

  constructor(
    private readonly port: number,
    private readonly challenges: AuthChallengeService,
    private readonly logger: Logger
  ) {
    this.app.use(express.urlencoded({ extended: false }));

    this.app.get("/auth/:token", (req, res) => {
      const token = req.params.token;
      const prompt = this.challenges.getPrompt(token);
      if (!prompt) {
        res.status(404).send("Token is invalid or expired.");
        return;
      }
      res.send(
        this.authPageTemplate
          .replaceAll("{{PROMPT}}", prompt)
          .replaceAll("{{TOKEN}}", token)
      );
    });

    this.app.post("/auth/:token", (req, res) => {
      const token = req.params.token;
      const value = String(req.body?.value ?? "");
      const result = this.challenges.submit(token, value);
      if (!result.ok) {
        res.status(400).send(`Submit failed: ${result.reason}`);
        return;
      }
      res.send("Input accepted. You can close this page.");
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = this.app.listen(this.port, () => {
        this.logger.info("auth_http_service_started", { port: this.port });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
