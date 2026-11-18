import { Request, Response } from "express";
import mongoose from "mongoose";
import { Appointment } from "../models/appointment.model";
import { Service } from "../models/service.model";
import { z } from "zod";

const createAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be format YYYY-MM-DD"),
  timeSlot: z.enum([
    "10:00 AM",
    "11:00 AM",
    "12:00 PM",
    "01:00 PM",
    "02:00 PM",
    "03:00 PM",
    "04:00 PM",
    "05:00 PM",
    "06:00 PM",
  ]),
  message: z.string().optional(),
});

// CUSTOMER: Create appointment
export async function createAppointment(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Role check: Only customers can book
    if (req.user.role !== "customer") {
      res.status(403).json({ success: false, message: "Only customers can book appointments" });
      return;
    }

    const parseResult = createAppointmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0].message,
        errors: parseResult.error.errors,
      });
      return;
    }

    const { serviceId, appointmentDate, timeSlot, message } = parseResult.data;

    // Validate past date
    const today = new Date().toISOString().split("T")[0];
    if (appointmentDate < today) {
      res.status(400).json({ success: false, message: "Cannot book appointments in the past" });
      return;
    }

    // Check service exists and is active
    const service = await Service.findById(serviceId);
    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    if (service.status !== "active") {
      res.status(400).json({ success: false, message: "This service is currently inactive and cannot be booked" });
      return;
    }

    // CONCURRENCY & DOUBLE-BOOKING CHECK
    // Check if an active appointment already exists for this service, date, and timeSlot
    const conflictingAppointment = await Appointment.findOne({
      serviceId,
      appointmentDate,
      timeSlot,
      status: { $in: ["Pending", "Confirmed"] }, // Cancelled slots are released
    });

    if (conflictingAppointment) {
      res.status(409).json({
        success: false,
        message: "This time slot has already been booked. Please select another time or date.",
      });
      return;
    }

    const appointment = await Appointment.create({
      serviceId: service._id,
      customerId: req.user._id,
      appointmentDate,
      timeSlot,
      message: message || "",
      servicePrice: service.price,
      paymentStatus: "Unpaid",
      status: "Pending",
    });

    const populated = await Appointment.findById(appointment._id)
      .populate("serviceId", "serviceName category price duration image")
      .populate("customerId", "name email phone");

    res.status(201).json({
      success: true,
      message: "Appointment request submitted successfully. Pending admin confirmation.",
      data: populated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error booking appointment", error: error.message });
  }
}

// CUSTOMER: Get my appointments
export async function getMyAppointments(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const appointments = await Appointment.find({ customerId: req.user._id })
      .populate("serviceId", "serviceName category price duration image")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching appointments", error: error.message });
  }
}

// CUSTOMER/ADMIN: Get single appointment details
export async function getAppointmentById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id)
      .populate("serviceId", "serviceName category price duration image")
      .populate("customerId", "name email phone");

    if (!appointment) {
      res.status(404).json({ success: false, message: "Appointment not found" });
      return;
    }

    // Authorization check
    if (
      req.user?.role !== "admin" &&
      appointment.customerId._id.toString() !== req.user?._id.toString()
    ) {
      res.status(403).json({ success: false, message: "Access forbidden. Not your appointment." });
      return;
    }

    res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching appointment", error: error.message });
  }
}

// CUSTOMER: Cancel own pending appointment
export async function cancelMyAppointment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      res.status(404).json({ success: false, message: "Appointment not found" });
      return;
    }

    // Ownership check
    if (appointment.customerId.toString() !== req.user?._id.toString()) {
      res.status(403).json({ success: false, message: "You can only cancel your own appointments" });
      return;
    }

    // Rule: Customers can only cancel Pending appointments
    if (appointment.status !== "Pending") {
      res.status(400).json({
        success: false,
        message: `Cannot cancel appointment with status '${appointment.status}'. Only Pending appointments can be cancelled by the customer.`,
      });
      return;
    }

    appointment.status = "Cancelled";
    await appointment.save();

    res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      data: appointment,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error cancelling appointment", error: error.message });
  }
}

// ADMIN: Get all appointments
export async function getAllAdminAppointments(req: Request, res: Response): Promise<void> {
  try {
    const appointments = await Appointment.find()
      .populate("serviceId", "serviceName category price duration image")
      .populate("customerId", "name email phone image")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching admin appointments", error: error.message });
  }
}

// ADMIN: Update appointment status (Confirm / Cancel)
export async function updateAppointmentStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Confirmed", "Cancelled"].includes(status)) {
      res.status(400).json({ success: false, message: "Status must be either 'Confirmed' or 'Cancelled'" });
      return;
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      res.status(404).json({ success: false, message: "Appointment not found" });
      return;
    }

    // Rule: Only Pending appointments can be Confirmed
    if (status === "Confirmed" && appointment.status !== "Pending") {
      res.status(400).json({
        success: false,
        message: `Only Pending appointments can be confirmed. Current status: ${appointment.status}`,
      });
      return;
    }

    appointment.status = status;
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate("serviceId", "serviceName category price duration image")
      .populate("customerId", "name email phone image");

    res.status(200).json({
      success: true,
      message: `Appointment successfully marked as ${status}`,
      data: populated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error updating appointment status", error: error.message });
  }
}
