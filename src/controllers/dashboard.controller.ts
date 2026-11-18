import { Request, Response } from "express";
import { User } from "../models/user.model";
import { Service } from "../models/service.model";
import { Appointment } from "../models/appointment.model";
import { Transaction } from "../models/transaction.model";

// ADMIN: Get stats overview
export async function getAdminOverview(req: Request, res: Response): Promise<void> {
  try {
    const totalCustomers = await User.countDocuments({ role: "customer" });
    const totalActiveServices = await Service.countDocuments({ status: "active" });
    const totalAppointments = await Appointment.countDocuments();
    const pendingAppointments = await Appointment.countDocuments({ status: "Pending" });
    const confirmedAppointments = await Appointment.countDocuments({ status: "Confirmed" });
    const cancelledAppointments = await Appointment.countDocuments({ status: "Cancelled" });
    const totalPaidAppointments = await Appointment.countDocuments({ paymentStatus: "Paid" });

    // Calculate revenue from Transactions
    const revenueAgg = await Transaction.aggregate([
      { $match: { status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        totalActiveServices,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        cancelledAppointments,
        totalPaidAppointments,
        totalRevenue,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching admin overview", error: error.message });
  }
}

// CUSTOMER: Get customer stats overview
export async function getCustomerOverview(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const customerId = req.user._id;

    const totalRequests = await Appointment.countDocuments({ customerId });
    const pendingAppointments = await Appointment.countDocuments({ customerId, status: "Pending" });
    const confirmedAppointments = await Appointment.countDocuments({ customerId, status: "Confirmed" });
    const cancelledAppointments = await Appointment.countDocuments({ customerId, status: "Cancelled" });
    const paidAppointments = await Appointment.countDocuments({ customerId, paymentStatus: "Paid" });

    res.status(200).json({
      success: true,
      data: {
        totalRequests,
        pendingAppointments,
        confirmedAppointments,
        cancelledAppointments,
        paidAppointments,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching customer overview", error: error.message });
  }
}

// ADMIN: Get all customers
export async function getAllCustomers(req: Request, res: Response): Promise<void> {
  try {
    const customers = await User.find({ role: "customer" }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching users", error: error.message });
  }
}

// ADMIN: Block / Unblock customer
export async function toggleBlockUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Security: Cannot block admin accounts
    if (user.role === "admin") {
      res.status(400).json({ success: false, message: "Cannot block an administrator account" });
      return;
    }

    user.isBlocked = Boolean(isBlocked);
    await user.save();

    res.status(200).json({
      success: true,
      message: `User has been ${user.isBlocked ? "blocked" : "unblocked"} successfully`,
      data: user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error toggling block state", error: error.message });
  }
}

// ADMIN: Get all transactions
export async function getAllTransactions(req: Request, res: Response): Promise<void> {
  try {
    const transactions = await Transaction.find()
      .populate("customerId", "name email phone")
      .populate({
        path: "appointmentId",
        populate: { path: "serviceId", select: "serviceName price category" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching transactions", error: error.message });
  }
}

// CUSTOMER: Get my transactions
export async function getMyTransactions(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const transactions = await Transaction.find({ customerId: req.user._id })
      .populate({
        path: "appointmentId",
        populate: { path: "serviceId", select: "serviceName price category" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching my transactions", error: error.message });
  }
}
