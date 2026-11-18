import mongoose, { Document, Schema } from "mongoose";

export interface IAppointment extends Document {
  serviceId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  appointmentDate: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "10:00 AM"
  message?: string;
  servicePrice: number;
  paymentStatus: "Unpaid" | "Paid";
  status: "Pending" | "Confirmed" | "Cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    appointmentDate: {
      type: String,
      required: true,
      trim: true,
    },
    timeSlot: {
      type: String,
      required: true,
      enum: [
        "10:00 AM",
        "11:00 AM",
        "12:00 PM",
        "01:00 PM",
        "02:00 PM",
        "03:00 PM",
        "04:00 PM",
        "05:00 PM",
        "06:00 PM",
      ],
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    servicePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Paid"],
      default: "Unpaid",
      index: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled"],
      default: "Pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to facilitate fast queries & partial unique constraints
AppointmentSchema.index(
  { serviceId: 1, appointmentDate: 1, timeSlot: 1 },
  { name: "service_slot_idx" }
);

export const Appointment = mongoose.model<IAppointment>("Appointment", AppointmentSchema);
