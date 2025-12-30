import User from '../../../models/User.js';
import cloudinary from '../../../middlewares/utils/cloudinary.js';   // make sure you have this
import { generateOTP } from '../../../middlewares/utils/generateOTP.js';
import { sendEmail } from '../../../middlewares/utils/emailService.js';
import { sendSms } from '../../../middlewares/utils/sendSms.js';
import { addressSchema } from "../../../middlewares/validations/userProfileValidation.js";
import { validatePincodeServiceabilityDelhivery } from "../../../middlewares/services/delhiveryService.js";
import { uploadToCloudinary } from "../../../middlewares/upload.js";
import bcrypt from 'bcryptjs';

// Get Basic User Profile
// export const getUserProfile = async (req, res) => {
//     try {
//         const user = await User.findById(req.user._id).select(
//             'name email phone gender dob profileImage isVerified addresses'
//         );
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         let formattedDob = null;
//         if (user.dob instanceof Date && !isNaN(user.dob)) {
//             const d = user.dob;
//             formattedDob = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
//         }

//         res.status(200).json({
//             profile: {
//                 fullName: user.name,
//                 gender: user.gender || null,
//                 phone: user.phone || null,
//                 email: user.email || null,
//                 dob: formattedDob,
//                 isEmailVerified: user.isVerified,
//                 isPhoneVerified: user.phoneVerified,
//                 profileImage: user.profileImage || null
//             },
//             addresses: user.addresses || []
//         });
//     } catch (err) {
//         res.status(500).json({ message: 'Failed to get profile', error: err.message });
//     }
// };

export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select(
            'name email phone gender dob profileImage isVerified phoneVerified addresses'
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let formattedDob = null;
        if (user.dob instanceof Date && !isNaN(user.dob.getTime())) {
            const d = user.dob;
            formattedDob = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        }

        res.status(200).json({
            profile: {
                fullName: user.name,
                gender: user.gender ?? null,
                phone: user.phone ?? null,
                email: user.email ?? null,
                dob: formattedDob,
                isEmailVerified: user.isVerified,
                isPhoneVerified: user.phoneVerified,
                profileImage: user.profileImage ?? null
            },
            addresses: user.addresses ?? []
        });

    } catch (err) {
        res.status(500).json({
            message: 'Failed to get profile',
            error: err.message
        });
    }
};

export const updateUserProfile = async (req, res) => {
    try {
        const { fullName, gender, dob, email, phone } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (fullName) user.name = fullName;
        if (gender) user.gender = gender;
        if (dob) {
            // Expecting DD-MM-YYYY
            const [day, month, year] = dob.split('-');

            const parsedDob = new Date(
                Number(year),
                Number(month) - 1,
                Number(day)
            );

            if (isNaN(parsedDob.getTime())) {
                return res.status(400).json({
                    message: 'Invalid DOB format. Expected DD-MM-YYYY'
                });
            }

            user.dob = parsedDob;
        }

        // email changed → reset verification
        if (email && email !== user.email) {
            user.email = email;
            user.isVerified = false;
        }

        // phone changed → store as pending, require verification
        if (phone && phone !== user.phone) {
            user.pendingPhone = phone;
            await user.save();
            return res.status(200).json({
                message: 'Phone updated, please verify before it becomes active',
                requiresPhoneVerification: true
            });
        }

        await user.save();
        return res.status(200).json({ message: 'Profile updated successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to update profile', error: err.message });
    }
};


export const uploadProfileImage = async (req, res) => {
    try {

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: "No image uploaded" });
        }

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // 🔥 Upload to Cloudinary using buffer (just like comments)
        const result = await uploadToCloudinary(req.file.buffer, "users/profile");

        // result may be object OR string → normalize it
        const imageUrl = typeof result === "string" ? result : result.secure_url;
        const publicId = typeof result === "string" ? "" : result.public_id;

        // 🔥 Save to DB
        user.profileImage = imageUrl;
        user.profileImageId = publicId;

        await user.save();

        res.status(200).json({
            message: "Profile image updated",
            profileImage: imageUrl
        });

    } catch (err) {
        console.error("Profile upload error:", err);
        res.status(500).json({
            message: "Failed to upload profile image",
            error: err.message
        });
    }
};


// Remove Profile Image (including delete from Cloudinary)
export const removeProfileImage = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.profileImage) {
            return res.status(400).json({ message: 'No profile image to remove' });
        }

        // If we have public_id → delete from cloudinary
        if (user.profileImageId) {
            await cloudinary.uploader.destroy(user.profileImageId);
        }

        // remove from user document
        user.profileImage = null;
        user.profileImageId = null;
        await user.save();

        res.status(200).json({ message: 'Profile image removed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to remove profile image', error: err.message });
    }
};

// Get current profile image
export const getProfileImage = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('profileImage');
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.profileImage) {
            return res.status(404).json({ message: 'No profile image found' });
        }

        res.status(200).json({ profileImage: user.profileImage });
    } catch (err) {
        res.status(500).json({ message: 'Failed to get profile image', error: err.message });
    }
};

//--------------------------------------------------------------Addresses---------------------------------------------------------------//

// ✅ Add User Address with Delhivery Pincode Validation
export const addUserAddress = async (req, res) => {
    try {
        const { error } = addressSchema.validate(req.body);
        if (error)
            return res.status(400).json({ message: error.details[0].message });

        const user = await User.findById(req.user._id);
        if (!user)
            return res.status(404).json({ message: "User not found" });

        const { name, phone, email, pincode, addressLine1, city, state, houseNumber } = req.body;

        // 🧠 Step 1: Validate pincode via Delhivery
        let serviceable = false;
        let couriers = [];

        try {
            const result = await validatePincodeServiceabilityDelhivery(pincode); // FIXED
            serviceable = result.serviceable;
            couriers = result.couriers || [];
        } catch (err) {
            console.error("❌ Pincode validation skipped:", err.message);
            return res.status(400).json({
                message: `🚫 Unable to validate pincode ${pincode} with Delhivery. Try again.`, // FIXED
            });
        }

        if (!serviceable) {
            return res.status(400).json({
                message: `🚫 Delivery not available for pincode ${pincode}. Please enter a different one.`,
            });
        }


        // Step 2: Normalize and check duplicates
        const normalized = {
            name: name.trim(),
            phone: phone.trim(),
            email: email?.trim().toLowerCase() || user.email,
            pincode: String(pincode).trim(),
            addressLine1: addressLine1.trim().toLowerCase(),
            city: city.trim().toLowerCase(),
            state: state.trim().toLowerCase(),
            houseNumber: houseNumber ? houseNumber.trim().toLowerCase() : "",
        };

        const exists = user.addresses.some(addr =>
            addr.email === normalized.email &&
            addr.phone === normalized.phone &&
            String(addr.pincode).trim() === normalized.pincode &&
            addr.addressLine1.trim().toLowerCase() === normalized.addressLine1 &&
            addr.city.trim().toLowerCase() === normalized.city &&
            addr.state.trim().toLowerCase() === normalized.state &&
            (addr.houseNumber ? addr.houseNumber.trim().toLowerCase() : "") === normalized.houseNumber
        );

        if (exists)
            return res.status(400).json({ message: "❌ This address with same contact already exists" });

        // Step 3: Save Address
        user.addresses.push(normalized);
        await user.save();

        res.status(201).json({
            message: "✅ Address added successfully",
            addresses: user.addresses
        });
    } catch (err) {
        console.error("Error adding address:", err.message);
        res.status(500).json({ message: "Failed to add address", error: err.message });
    }
};

// ✅ Update Address (with Delhivery pincode validation)
export const updateUserAddress = async (req, res) => {
    try {
        const { error } = addressSchema.validate(req.body);
        if (error)
            return res.status(400).json({ message: error.details[0].message });

        const user = await User.findById(req.user._id);
        if (!user)
            return res.status(404).json({ message: "User not found" });

        const address = user.addresses.id(req.params.id);
        if (!address)
            return res.status(404).json({ message: "Address not found" });

        const { name, phone, email, pincode, addressLine1, city, state, houseNumber } = req.body;

        // 🧠 Step 1: Validate pincode via Delhivery (GET)
        let serviceable = false;
        let couriers = [];

        try {
            const result = await validatePincodeServiceabilityDelhivery(pincode);
            serviceable = result.serviceable;
            couriers = result.couriers || [];
        } catch (err) {
            console.error("❌ Pincode validation skipped:", err.message);
            return res.status(400).json({
                message: `🚫 Unable to validate pincode ${pincode} with Delhivery. Try again.`,
            });
        }

        if (!serviceable) {
            return res.status(400).json({
                message: `🚫 Delivery not available for pincode ${pincode}. Please enter a different one.`,
            });
        }

        const normalized = {
            name: name.trim(),
            phone: phone.trim(),
            email: email?.trim().toLowerCase() || user.email,
            pincode: String(pincode).trim(),
            addressLine1: addressLine1.trim().toLowerCase(),
            city: city.trim().toLowerCase(),
            state: state.trim().toLowerCase(),
            houseNumber: houseNumber ? houseNumber.trim().toLowerCase() : "",
        };

        const isSameAsCurrent =
            address.name === normalized.name &&
            address.phone === normalized.phone &&
            address.email === normalized.email &&
            String(address.pincode).trim() === normalized.pincode &&
            address.addressLine1.trim().toLowerCase() === normalized.addressLine1 &&
            address.city.trim().toLowerCase() === normalized.city &&
            address.state.trim().toLowerCase() === normalized.state &&
            (address.houseNumber ? address.houseNumber.trim().toLowerCase() : "") === normalized.houseNumber;

        if (isSameAsCurrent)
            return res.status(400).json({
                message:
                    "⚠️ This is already your current address & contact details, enter different details to update",
            });

        const exists = user.addresses.some(addr =>
            addr._id.toString() !== req.params.id &&
            addr.email === normalized.email &&
            addr.phone === normalized.phone &&
            String(addr.pincode).trim() === normalized.pincode &&
            addr.addressLine1.trim().toLowerCase() === normalized.addressLine1 &&
            addr.city.trim().toLowerCase() === normalized.city &&
            addr.state.trim().toLowerCase() === normalized.state &&
            (addr.houseNumber ? addr.houseNumber.trim().toLowerCase() : "") === normalized.houseNumber
        );

        if (exists)
            return res.status(400).json({ message: "❌ Another address with same contact already exists" });

        Object.assign(address, normalized);
        await user.save();

        res.status(200).json({
            message: "✅ Address updated successfully",
            addresses: user.addresses
        });
    } catch (err) {
        console.error("Error updating address:", err.message);
        res.status(500).json({ message: "Failed to update address", error: err.message });
    }
};
// Delete Address
export const deleteUserAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.addresses.pull({ _id: req.params.id });
        await user.save();

        res.status(200).json({ message: '✅ Address deleted', addresses: user.addresses });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete address', error: err.message });
    }
};

// Get All Addresses
export const getUserAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("addresses");
        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({ addresses: user.addresses });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch addresses", error: err.message });
    }
};


//------------------------------------------------------------------------------verification---------------------------------------------------------------//
export const sendVerificationOtp = async (req, res) => {
    try {
        const { method } = req.body; // "email" or "phone"
        if (!method) return res.status(400).json({ message: 'Method (email/phone) is required' });

        // Fetch user
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found', debug: { userId: req.user._id } });

        // Generate OTP
        const otp = generateOTP();
        const hashedOtp = await bcrypt.hash(otp, 10);
        user.otp = {
            code: hashedOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            attemptsLeft: 3
        };

        // Save user
        await user.save().catch(err => {
            throw new Error(`Saving OTP to user failed: ${err.message}`);
        });

        // Determine recipient
        let target = '';
        if (method === 'phone') {
            target = user.pendingPhone || user.phone;
            if (!target) {
                return res.status(400).json({
                    message: 'Phone number not available',
                    debug: { userPhone: user.phone, pendingPhone: user.pendingPhone }
                });
            }
            try {
                await sendSms(target, `Your verification OTP is: ${otp}`);
            } catch (smsErr) {
                return res.status(500).json({
                    message: 'Failed to send SMS OTP',
                    debug: {
                        phone: target,
                        smsError: smsErr.message,
                        stack: smsErr.stack
                    }
                });
            }
        } else if (method === 'email') {
            target = user.email;
            if (!target) {
                return res.status(400).json({
                    message: 'Email not available',
                    debug: { userEmail: user.email }
                });
            }
            try {
                await sendEmail(user.email, 'Verify your email', `<p>Your OTP is: <b>${otp}</b></p>`);
            } catch (emailErr) {
                return res.status(500).json({
                    message: 'Failed to send Email OTP',
                    debug: {
                        email: target,
                        emailError: emailErr.message,
                        stack: emailErr.stack
                    }
                });
            }
        } else {
            return res.status(400).json({ message: 'Invalid method', debug: { receivedMethod: method } });
        }

        res.status(200).json({
            message: `OTP sent via ${method}`,
            debug: { target, otpHash: hashedOtp } // optional: for dev/debug only
        });
    } catch (err) {
        console.error('sendVerificationOtp ERROR:', err);
        res.status(500).json({
            message: 'Unexpected error sending OTP',
            debug: {
                errorMessage: err.message,
                stack: err.stack,
                body: req.body,
                userId: req.user?._id
            }
        });
    }
};


export const verifyOtp = async (req, res) => {
    const { otp } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otp?.code) return res.status(400).json({ message: 'No OTP found' });

    if (new Date() > new Date(user.otp.expiresAt)) {
        user.otp = undefined;
        await user.save();
        return res.status(400).json({ message: 'OTP expired' });
    }

    const isValid = await bcrypt.compare(otp, user.otp.code);
    if (!isValid) {
        user.otp.attemptsLeft -= 1;
        await user.save();
        return res.status(400).json({ message: 'Invalid OTP', attemptsLeft: user.otp.attemptsLeft });
    }

    // ✅ verified successfully
    user.otp = undefined;

    // if there is a pendingPhone → update official phone and clear pending
    if (user.pendingPhone) {
        user.phone = user.pendingPhone;
        user.pendingPhone = null;
    } else {
        // otherwise mark normal email as verified
        user.isVerified = true;
    }

    await user.save();
    res.status(200).json({ message: 'Verification successful' });
};
