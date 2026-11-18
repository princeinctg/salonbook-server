import { connectDB } from "./config/database";
import { User } from "./models/user.model";
import { Service } from "./models/service.model";
import bcrypt from "bcryptjs";

export async function seedInitialData() {
  await connectDB();

  // Admin account
  const adminEmail = "admin@salonbook.com";
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("Admin123", salt);
    await User.create({
      name: "Salon Administrator",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
      isBlocked: false,
      provider: "credential",
    });
    console.log("[Seed] Admin user created: admin@salonbook.com");
  }

  // Customer demo account
  const custEmail = "customer@salonbook.com";
  let cust = await User.findOne({ email: custEmail });
  if (!cust) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("Customer123", salt);
    await User.create({
      name: "Jane Doe",
      email: custEmail,
      password: hashedPassword,
      phone: "+1 (555) 234-5678",
      role: "customer",
      isBlocked: false,
      provider: "credential",
    });
    console.log("[Seed] Customer user created: customer@salonbook.com");
  }

  // Services
  const count = await Service.countDocuments();
  if (count === 0) {
    const services = [
      {
        serviceName: "Signature Master Haircut & Styling",
        category: "Haircut & Styling",
        description: "Personalized scissor cut, luxury scalp cleanse, invigorating massage, and finished styling with artisanal pomade.",
        price: 65,
        duration: 45,
        image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Precision Beard Sculpting & Hot Towel",
        category: "Haircut & Styling",
        description: "Crisp straight-razor detailing, botanical pre-shave oil, organic hot towel compress, and soothing balm treatment.",
        price: 45,
        duration: 35,
        image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Full Dimension Balayage & Glaze",
        category: "Hair Coloring",
        description: "Custom hand-painted highlights tailored to enhance facial geometry, completed with nourishing bond gloss.",
        price: 180,
        duration: 120,
        image: "https://images.unsplash.com/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Deep Keratin Restoration Therapy",
        category: "Hair Treatment",
        description: "Intense moisture infusion with micro-keratin molecules, revitalizing damaged follicles and providing lasting silkiness.",
        price: 130,
        duration: 75,
        image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Revitalizing Hydrafacial & Glow Peel",
        category: "Facial & Skincare",
        description: "Deep ultrasonic pore cleansing, lactic peptide exfoliation, antioxidant infusion, and LED collagen stimulation.",
        price: 110,
        duration: 60,
        image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Bridal & Red-Carpet Glamour Makeup",
        category: "Makeup",
        description: "HD long-lasting couture makeup tailored to studio lighting, featuring mink lashes and airbrush foundation.",
        price: 150,
        duration: 90,
        image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Deluxe Gel Manicure & Botanical Spa",
        category: "Manicure & Pedicure",
        description: "Exfoliating rose-quartz scrub, cuticle treatment, organic shea butter massage, and LED chip-resistant gel finish.",
        price: 55,
        duration: 50,
        image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
      {
        serviceName: "Aromatherapy Full Body Warm Stone Massage",
        category: "Spa & Massage",
        description: "Volcanic basalt stones combined with lavender and bergamot essential oils to melt muscular tension and restore tranquility.",
        price: 125,
        duration: 60,
        image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
        status: "active",
      },
    ];
    await Service.insertMany(services);
    console.log("[Seed] Seeded 8 default salon services");
  }
}

if (require.main === module || process.argv[1]?.endsWith("seed.ts")) {
  seedInitialData()
    .then(() => {
      console.log("[Seed] Done");
      process.exit(0);
    })
    .catch((e) => {
      console.error("[Seed Error]", e);
      process.exit(1);
    });
}
