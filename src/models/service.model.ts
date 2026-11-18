import mongoose, { Document, Schema } from "mongoose";

export interface IService extends Document {
  serviceName: string;
  category: string;
  description: string;
  price: number;
  duration: number; // in minutes
  image: string;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema = new Schema<IService>(
  {
    serviceName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 1, // at least 1 minute
    },
    image: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Service = mongoose.model<IService>("Service", ServiceSchema);
