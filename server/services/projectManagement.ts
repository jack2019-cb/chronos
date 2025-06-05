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
    return prisma.calendar.create({
      data: {
        ...data,
        settings: (data.settings as Prisma.InputJsonValue) || {},
      },
      include: {
        events: true,
      },
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
    return prisma.calendar.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        events: true,
      },
    });
  }

  /**
   * Update a calendar project
   */
  async updateProject(data: UpdateProjectInput) {
    const { id, ...updateData } = data;

    // Verify project exists
    const existing = await this.getProject(id);

    // Handle settings update
    let newSettings: Prisma.InputJsonValue = existing.settings || {};
    if (updateData.settings) {
      newSettings = {
        ...(typeof existing.settings === "object" ? existing.settings : {}),
        ...updateData.settings,
      };
    }

    return prisma.calendar.update({
      where: { id },
      data: {
        ...updateData,
        settings: newSettings,
      },
      include: {
        events: true,
      },
    });
  }

  /**
   * Delete a calendar project
   */
  async deleteProject(id: string) {
    // Verify project exists
    await this.getProject(id);

    // Delete project and related events (cascade)
    return prisma.calendar.delete({
      where: { id },
    });
  }
}

export const projectManagementService = new ProjectManagementService();
