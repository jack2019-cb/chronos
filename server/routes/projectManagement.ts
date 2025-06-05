import express from "express";
import { projectManagementService } from "../services/projectManagement";
import { CalendarError } from "../lib/errors";

const router = express.Router();

// Create a new project
router.post("/", async (req, res, next) => {
  try {
    if (!req.body.name || !req.body.year || !req.body.selectedMonths) {
      throw new CalendarError("Missing required fields", 400);
    }
    const project = await projectManagementService.createProject(req.body);
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Get a project by ID
router.get("/:id", async (req, res, next) => {
  try {
    const project = await projectManagementService.getProject(req.params.id);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// List all projects
router.get("/", async (req, res, next) => {
  try {
    const projects = await projectManagementService.listProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Update a project
router.put("/:id", async (req, res, next) => {
  try {
    const project = await projectManagementService.updateProject({
      id: req.params.id,
      ...req.body,
    });
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Delete a project
router.delete("/:id", async (req, res, next) => {
  try {
    await projectManagementService.deleteProject(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
