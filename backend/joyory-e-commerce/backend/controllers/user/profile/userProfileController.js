import User from '../../../models/User.js';
import cloudinary from '../../../middlewares/utils/cloudinary.js';   // make sure you have this
import { generateOTP } from '../../../middlewares/utils/generateOTP.js';
import { sendEmail } from '../../../middlewares/utils/emailService.js';
import { sendSms } from '../../../middlewares/utils/sendSms.js';
import bcrypt from 'bcryptjs';

// Get Basic User Profile
export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select(
            'name email phone gender dob profileImage isVerified addresses'
        );
        if (!user) return res.status(404).json({ message: 'User not found' });

        let formattedDob = null;
        if (user.dob instanceof Date && !isNaN(user.dob)) {
            const d = user.dob;
            formattedDob = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        }

        res.status(200).json({
            profile: {
                fullName: user.name,
                gender: user.gender || null,
                phone: user.phone || null,
                email: user.email || null,
                dob: formattedDob,
                isEmailVerified: user.isVerified,
                isPhoneVerified: Boolean(user.phone),
                profileImage: user.profileImage || null
            },
            addresses: user.addresses || []
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to get profile', error: err.message });
    }
};

// Update Basic Info  (name, gender, dob, email, phone)
// Update Basic Info (name, gender, dob, email, phone but with phone verification)
export const updateUserProfile = async (req, res) => {
    try {
        const { fullName, gender, dob, email, phone } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (fullName) user.name = fullName;
        if (gender) user.gender = gender;
        if (dob) user.dob = new Date(dob);

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


// Upload / Update Profile Image (Cloudinary with public_id)
export const uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const uploadResult = await cloudinary.uploader.upload(req.file.path);

        const user = await User.findById(req.user._id);
        user.profileImage = uploadResult.secure_url;
        user.profileImageId = uploadResult.public_id;     // 👈 store public id
        await user.save();

        res.status(200).json({
            message: 'Profile image updated',
            profileImage: uploadResult.secure_url
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to upload profile image', error: err.message });
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


// Add Address
export const addUserAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Check for duplicate
        const exists = user.addresses.some(addr =>
            addr.pincode === req.body.pincode &&
            addr.addressLine1 === req.body.addressLine1 &&
            addr.city === req.body.city &&
            addr.state === req.body.state);

        if (exists) {
            return res.status(400).json({ message: 'This address already exists' });
        }

        user.addresses.push(req.body);
        await user.save();

        res.status(201).json({ message: 'Address added', addresses: user.addresses });
    } catch (err) {
        res.status(500).json({ message: 'Failed to add address', error: err.message });
    }
};

// Update Address
export const updateUserAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const address = user.addresses.id(req.params.id);
        if (!address) return res.status(404).json({ message: 'Address not found' });

        // Check if new updated values already exist in another address
        const exists = user.addresses.some(addr =>
            addr.id !== req.params.id &&
            addr.pincode === req.body.pincode &&
            addr.addressLine1 === req.body.addressLine1 &&
            addr.city === req.body.city &&
            addr.state === req.body.state);

        if (exists) {
            return res.status(400).json({ message: 'This address already exists, please use another address' });
        }

        Object.assign(address, req.body);
        await user.save();

        res.status(200).json({ message: 'Address updated', addresses: user.addresses });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update address', error: err.message });
    }
};

// Delete Address
export const deleteUserAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.addresses.pull({ _id: req.params.id });
        await user.save();

        res.status(200).json({ message: 'Address deleted', addresses: user.addresses });
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
