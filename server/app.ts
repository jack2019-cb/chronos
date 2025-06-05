import express, { Express, Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";

import indexRouter from "./routes/index";
import usersRouter from "./routes/users";
import calendarRouter from "./routes/calendar";
import googleCalendarRouter from "./routes/googleCalendar";

const app: Express = express();

// Basic Express settings
app.set("json spaces", 2);
app.set("x-powered-by", false);

// Middleware
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/calendar", calendarRouter);
app.use("/calendar/google", googleCalendarRouter);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something broke!" });
});

export default app;
