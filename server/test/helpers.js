import express from "express";
export function makeTestApp(configure) { const app=express(); app.use(express.json()); configure(app); return app; }
