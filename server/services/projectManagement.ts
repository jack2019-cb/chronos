import { Prisma } from "@prisma/client";
import { CalendarError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// Custom error classes
class NotFoundError extends CalendarError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

class BadRequestError extends CalendarError {
  constructor(message: string) {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

interface CalendarSettings {
  [key: string]: any;
  theme?: {
    colors?: string[];
    fonts?: string[];
    layout?: string;
  };
  design?: {
    backgroundStyle?: string;
    headerStyle?: string;
  };
  preferences?: {
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    showHolidays?: boolean;
  };
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  year: number;
  selectedMonths: string[];
  settings?: CalendarSettings;
  backgroundUrl?: string;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  id: string;
}

export class ProjectManagementService {
  /**
   * Create a new calendar project
   */
  async createProject(data: CreateProjectInput) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.calendar.create({
        data: {
          ...data,
          settings: (data.settings as Prisma.InputJsonValue) || {},
        },
        include: {
          events: true,
        },
      });

      // Verify project was created
      const verifyProject = await tx.calendar.findUnique({
        where: { id: project.id },
        include: { events: true },
      });

      if (!verifyProject) {
        throw new BadRequestError("Failed to create project");
      }

      return verifyProject;
    });
  }

  /**
   * Get a calendar project by ID
   */
  async getProject(id: string) {
    const project = await prisma.calendar.findUnique({
      where: { id },
      include: {
        events: true,
      },
    });

    if (!project) {
      throw new NotFoundError(`Calendar project ${id} not found`);
    }

    return project;
  }

  /**
   * List all calendar projects
   */
  async listProjects() {
    const projects = await prisma.calendar.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        events: true,
      },
    });

    // Return empty array if no projects
    return projects || [];
  }

  /**
   * Update a calendar project
   */
  async updateProject(data: UpdateProjectInput) {
    const { id, ...updateData } = data;
    const existingProject = await this.getProject(id);

    // Only include fields that are actually provided
    const updateFields: any = {};
    if (updateData.name !== undefined) updateFields.name = updateData.name;
    if (updateData.description !== undefined)
      updateFields.description = updateData.description;
    if (updateData.year !== undefined) updateFields.year = updateData.year;
    if (updateData.selectedMonths !== undefined)
      updateFields.selectedMonths = updateData.selectedMonths;
    if (updateData.backgroundUrl !== undefined)
      updateFields.backgroundUrl = updateData.backgroundUrl;
    if (updateData.settings !== undefined) {
      updateFields.settings = updateData.settings as Prisma.InputJsonValue;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.calendar.update({
        where: { id },
        data: updateFields,
        include: {
          events: true,
        },
      });

      // Verify update was successful
      const verifyUpdate = await tx.calendar.findUnique({
        where: { id },
        include: { events: true },
      });

      if (!verifyUpdate) {
        throw new BadRequestError("Failed to update project");
      }

      return verifyUpdate;
    });
  }

  /**
   * Delete a calendar project
   */
  async deleteProject(id: string) {
    const project = await prisma.calendar.findUnique({ where: { id } });
    if (!project) throw new NotFoundError(`Calendar project ${id} not found`);

    return prisma.$transaction(async (tx) => {
      await tx.event.deleteMany({ where: { calendarId: id } });
      try {
        await tx.calendar.delete({ where: { id } });
      } catch (err: any) {
        if (err.code === "P2025") return;
        throw err;
      }
      const verifyDelete = await tx.calendar.findUnique({ where: { id } });
      if (verifyDelete) {
        throw new BadRequestError("Failed to delete project");
      }
    });
  }
}

export const projectManagementService = new ProjectManagementService();
