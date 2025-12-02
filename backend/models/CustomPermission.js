import mongoose from "mongoose";

const customPermissionSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        label: { type: String, required: true },
        module: { type: String, required: true },
    },
    { timestamps: true }
);

export default mongoose.model("CustomPermission", customPermissionSchema);
