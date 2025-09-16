export const BUSINESS_REQUIREMENTS = {
    proprietorship: {
        requiredFields: ["panNumber", "bankDetails"],
        requiredDocs: ["panCard", "addressProof", "bankStatement"],
    },
    partnership: {
        requiredFields: ["panNumber", "gstNumber", "bankDetails"],
        requiredDocs: ["partnershipDeed", "panCard", "gstCertificate"],
    },
    llp: {
        requiredFields: ["panNumber", "gstNumber", "cin", "bankDetails"],
        requiredDocs: ["llpAgreement", "gstCertificate", "cinCertificate"],
    },
    private_limited: {
        requiredFields: ["panNumber", "gstNumber", "cin", "bankDetails"],
        requiredDocs: ["certificateOfIncorporation", "gstCertificate", "boardResolution"],
    },
    public_limited: {
        requiredFields: ["panNumber", "gstNumber", "cin", "bankDetails"],
        requiredDocs: ["certificateOfIncorporation", "gstCertificate", "boardResolution"],
    },
};
