import { Request, Response } from "express";
import { Service } from "../models/service.model";
import { z } from "zod";

const serviceSchema = z.object({
  serviceName: z.string().min(2, "Service name must be at least 2 characters"),
  category: z.string().min(2, "Category is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price: z.number().positive("Price must be a positive number"),
  duration: z.number().int().positive("Duration must be a positive integer in minutes"),
  image: z.string().url("Valid image URL is required"),
  status: z.enum(["active", "inactive"]).optional(),
});

// PUBLIC: Get active services with search, filter, and sorting
export async function getServices(req: Request, res: Response): Promise<void> {
  try {
    const { search, category, sort } = req.query;

    const query: any = { status: "active" };

    if (search && typeof search === "string" && search.trim()) {
      query.serviceName = { $regex: search.trim(), $options: "i" };
    }

    if (category && typeof category === "string" && category.trim() && category !== "All") {
      query.category = category.trim();
    }

    let sortOption: any = { createdAt: -1 }; // default newest
    if (sort === "price-asc") {
      sortOption = { price: 1 };
    } else if (sort === "price-desc") {
      sortOption = { price: -1 };
    }

    const services = await Service.find(query).sort(sortOption);

    res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching services", error: error.message });
  }
}

// PUBLIC: Get single service details
export async function getServiceById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);

    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Invalid service ID or fetch error", error: error.message });
  }
}

// ADMIN: Get all services (both active and inactive)
export async function getAllAdminServices(req: Request, res: Response): Promise<void> {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching admin services", error: error.message });
  }
}

// ADMIN: Create service
export async function createService(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = serviceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0].message,
        errors: parseResult.error.errors,
      });
      return;
    }

    const service = await Service.create({
      ...parseResult.data,
      status: parseResult.data.status || "active",
    });

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error creating service", error: error.message });
  }
}

// ADMIN: Update service
export async function updateService(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    const updated = await Service.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error updating service", error: error.message });
  }
}

// ADMIN: Delete service
export async function deleteService(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const service = await Service.findByIdAndDelete(id);
    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error deleting service", error: error.message });
  }
}
