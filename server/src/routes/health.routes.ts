import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
    res.json({
        success: true,
        message: "Kalima API is running",
    });
});

export default router;