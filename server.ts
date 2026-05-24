import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support up to 50MB base64 JSON payload
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // GET existing image overrides from persistent workspace JSON
  app.get("/api/overrides", (req, res) => {
    try {
      const overridesPath = path.join(process.cwd(), "src", "image-overrides.json");
      if (fs.existsSync(overridesPath)) {
        res.json(JSON.parse(fs.readFileSync(overridesPath, "utf-8")));
      } else {
        res.json({});
      }
    } catch (error: any) {
      console.error("Failed to read overrides JSON:", error);
      res.json({});
    }
  });

  // POST image overrides updates
  app.post("/api/overrides", (req, res) => {
    try {
      const { password, overrides } = req.body;
      if (password !== "Wuzhenxin123") {
        return res.status(401).json({ error: "Unauthorized: Invalid password" });
      }
      if (!overrides || typeof overrides !== "object") {
        return res.status(400).json({ error: "Invalid content format. Expecting overrides object" });
      }
      const overridesPath = path.join(process.cwd(), "src", "image-overrides.json");
      fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), "utf-8");
      console.log("Global image-overrides.json updated successfully via Admin API.");
      res.json({ success: true, message: "Overrides successfully updated!" });
    } catch (error: any) {
      console.error("Failed to update overrides JSON:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // GET portfolio items from persistent workspace JSON
  app.get("/api/portfolio", (req, res) => {
    try {
      const portfolioPath = path.join(process.cwd(), "src", "portfolio-data.json");
      if (fs.existsSync(portfolioPath)) {
        res.json(JSON.parse(fs.readFileSync(portfolioPath, "utf-8")));
      } else {
        res.status(404).json({ error: "Portfolio data not found" });
      }
    } catch (error: any) {
      console.error("Failed to read portfolio JSON:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // POST portfolio updates
  app.post("/api/portfolio", (req, res) => {
    try {
      const { password, data } = req.body;
      if (password !== "Wuzhenxin123") {
        return res.status(401).json({ error: "Unauthorized: Invalid password" });
      }
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Invalid content format. Expecting portfolio data array" });
      }
      const portfolioPath = path.join(process.cwd(), "src", "portfolio-data.json");
      fs.writeFileSync(portfolioPath, JSON.stringify(data, null, 2), "utf-8");
      console.log("Global portfolio-data.json updated successfully via Admin API.");
      res.json({ success: true, message: "Portfolio successfully updated!" });
    } catch (error: any) {
      console.error("Failed to update portfolio JSON:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API upload route
  app.post("/api/upload", (req, res) => {
    try {
      const { fileName, fileContent, originalUrl } = req.body;
      if (!fileName || !fileContent) {
        return res.status(400).json({ error: "Missing fileName or fileContent" });
      }
      
      const base64Data = fileContent.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      const ext = path.extname(fileName) || ".png";
      const baseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_]/g, "_");
      const newFileName = `uploaded_${Date.now()}_${baseName}${ext}`;
      
      const srcDir = path.join(process.cwd(), "src", "assets", "images");
      const pubDir = path.join(process.cwd(), "public", "assets", "images");
      
      if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir, { recursive: true });
      }
      if (!fs.existsSync(pubDir)) {
        fs.mkdirSync(pubDir, { recursive: true });
      }
      
      const srcPath = path.join(srcDir, newFileName);
      const pubPath = path.join(pubDir, newFileName);
      
      fs.writeFileSync(srcPath, buffer);
      fs.writeFileSync(pubPath, buffer);
      
      const relativeUrl = `/assets/images/${newFileName}`;
      console.log(`Saved uploaded file to: ${srcPath} and ${pubPath}`);
      
      // Update image-overrides.json file in the persistent workspace
      const overridesPath = path.join(process.cwd(), "src", "image-overrides.json");
      let overrides: Record<string, string> = {};
      if (fs.existsSync(overridesPath)) {
        try {
          overrides = JSON.parse(fs.readFileSync(overridesPath, "utf-8"));
        } catch (e) {
          overrides = {};
        }
      }
      overrides[originalUrl] = relativeUrl;
      fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), "utf-8");
      console.log(`Updated image-overrides.json with mapping: ${originalUrl} -> ${relativeUrl}`);
      
      res.json({ success: true, relativeUrl, originalUrl });
    } catch (error: any) {
      console.error("Upload failed in Express backend:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Serve static assets in public/assets directly to ensure newly uploaded images are served instantly
  app.use("/assets", express.static(path.join(process.cwd(), "public", "assets")));

  // Vite middleware or production static build
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
