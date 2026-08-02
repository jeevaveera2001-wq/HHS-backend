import mongoose from "mongoose";

import OwnerPayoutAccount from "../models/OwnerPayoutAccount.js";

const RAZORPAY_API_URL =
  "https://api.razorpay.com";

const PROVIDER_TIMEOUT_MS = 20000;

const payoutAccountInternalFields = [
  "+razorpay.linkedAccountId",
  "+razorpay.contactId",
  "+razorpay.fundAccountId",
  "+razorpay.stakeholderId",
  "+razorpay.productConfigurationId",
  "+razorpay.providerReference",
  "+razorpay.providerError",
].join(" ");

/* =====================================
   General helpers
===================================== */

const getUserId = (req) => {
  return (
    req.user?._id ||
    req.user?.id
  );
};

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(
    value
  );
};

const normalizeText = (value) => {
  return String(
    value ?? ""
  ).trim();
};

const normalizeAccountNumber = (
  value
) => {
  return String(
    value ?? ""
  ).replace(/\D/g, "");
};

const normalizeIfsc = (value) => {
  return normalizeText(
    value
  ).toUpperCase();
};

const normalizePhone = (value) => {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(-15);
};

const normalizeContactName = (
  value
) => {
  const name = normalizeText(value)
    .replace(
      /[^a-zA-Z0-9 '\-_/().]/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);

  return name.length >= 3
    ? name
    : "HHS Property Owner";
};

const maskVpa = (value) => {
  const normalizedVpa =
    normalizeText(
      value
    ).toLowerCase();

  const [
    username = "",
    handle = "",
  ] = normalizedVpa.split("@");

  if (!username || !handle) {
    return "";
  }

  const visibleUsername =
    username.slice(0, 2);

  return `${visibleUsername}${"•".repeat(
    Math.max(
      Math.min(
        username.length - 2,
        6
      ),
      3
    )
  )}@${handle}`;
};

const getProviderCredentials = () => {
  return {
    keyId:
      process.env
        .RAZORPAYX_KEY_ID ||
      process.env
        .RAZORPAY_KEY_ID ||
      "",

    keySecret:
      process.env
        .RAZORPAYX_KEY_SECRET ||
      process.env
        .RAZORPAY_KEY_SECRET ||
      "",
  };
};

const isProviderConfigured = () => {
  const {
    keyId,
    keySecret,
  } = getProviderCredentials();

  return Boolean(
    keyId &&
    keySecret
  );
};

const getProviderErrorMessage = (
  data,
  fallbackMessage
) => {
  return (
    data?.error?.description ||
    data?.error?.reason ||
    data?.message ||
    fallbackMessage
  );
};

/* =====================================
   Razorpay request helper
===================================== */

const razorpayRequest = async (
  path,
  body
) => {
  const {
    keyId,
    keySecret,
  } = getProviderCredentials();

  if (!keyId || !keySecret) {
    const configurationError =
      new Error(
        "Razorpay payout credentials are not configured."
      );

    configurationError.status = 503;

    configurationError.isProviderError =
      true;

    throw configurationError;
  }

  const authorization =
    Buffer.from(
      `${keyId}:${keySecret}`
    ).toString("base64");

  const abortController =
    new AbortController();

  const timeoutId = setTimeout(
    () => {
      abortController.abort();
    },
    PROVIDER_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_URL}${path}`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Basic ${authorization}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(body),

        signal:
          abortController.signal,
      }
    );

    const data = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      const providerError =
        new Error(
          getProviderErrorMessage(
            data,
            "Razorpay could not process the payout-account request."
          )
        );

      providerError.status =
        response.status;

      providerError.isProviderError =
        true;

      throw providerError;
    }

    return data;
  } catch (error) {
    if (
      error.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Razorpay did not respond within the permitted time."
        );

      timeoutError.status = 504;

      timeoutError.isProviderError =
        true;

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/* =====================================
   Razorpay entity creation
===================================== */

const createRazorpayContact = async ({
  ownerId,
  user,
}) => {
  return razorpayRequest(
    "/v1/contacts",
    {
      name:
        normalizeContactName(
          user?.fullName ||
          user?.displayName
        ),

      email:
        normalizeText(
          user?.email
        ).toLowerCase(),

      contact:
        normalizePhone(
          user?.phone
        ),

      type: "vendor",

      reference_id:
        `HHS-OWNER-${ownerId}`.slice(
          0,
          40
        ),

      notes: {
        platform: "HHS",
        owner_id:
          String(ownerId),
      },
    }
  );
};

const createRazorpayFundAccount =
  async ({
    contactId,
    submission,
  }) => {
    if (
      submission.payoutMethod ===
      "upi"
    ) {
      return razorpayRequest(
        "/v1/fund_accounts",
        {
          contact_id:
            contactId,

          account_type:
            "vpa",

          vpa: {
            address:
              submission.vpa,
          },
        }
      );
    }

    return razorpayRequest(
      "/v1/fund_accounts",
      {
        contact_id:
          contactId,

        account_type:
          "bank_account",

        bank_account: {
          name:
            submission
              .accountHolderName,

          ifsc:
            submission.ifsc,

          account_number:
            submission
              .accountNumber,
        },
      }
    );
  };

/* =====================================
   Submission validation
===================================== */

const validateSubmission = (
  body = {}
) => {
  const payoutMethod =
    normalizeText(
      body.payoutMethod ||
      "bank_account"
    );

  if (
    ![
      "bank_account",
      "upi",
    ].includes(payoutMethod)
  ) {
    return {
      error:
        "Select a valid payout method.",
    };
  }

  if (
    payoutMethod === "upi"
  ) {
    const vpa =
      normalizeText(
        body.vpa
      ).toLowerCase();

    if (
      !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(
        vpa
      )
    ) {
      return {
        error:
          "Please provide a valid UPI ID.",
      };
    }

    return {
      submission: {
        payoutMethod,
        vpa,
        maskedVpa:
          maskVpa(vpa),
      },
    };
  }

  const accountHolderName =
    normalizeText(
      body.accountHolderName
    );

  const accountNumber =
    normalizeAccountNumber(
      body.accountNumber
    );

  const confirmAccountNumber =
    normalizeAccountNumber(
      body.confirmAccountNumber
    );

  const ifsc =
    normalizeIfsc(
      body.ifsc
    );

  const bankName =
    normalizeText(
      body.bankName
    );

  const branchName =
    normalizeText(
      body.branchName
    );

  const accountType =
    normalizeText(
      body.accountType ||
      "savings"
    );

  if (
    accountHolderName.length <
      2 ||
    accountHolderName.length >
      120
  ) {
    return {
      error:
        "Please provide the account holder name exactly as shown by the bank.",
    };
  }

  if (
    !/^\d{6,34}$/.test(
      accountNumber
    )
  ) {
    return {
      error:
        "Please provide a valid bank account number.",
    };
  }

  if (!confirmAccountNumber) {
    return {
      error:
        "Please confirm the bank account number.",
    };
  }

  if (
    accountNumber !==
    confirmAccountNumber
  ) {
    return {
      error:
        "Bank account numbers do not match.",
    };
  }

  if (
    !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
      ifsc
    )
  ) {
    return {
      error:
        "Please provide a valid 11-character IFSC code.",
    };
  }

  if (
    ![
      "savings",
      "current",
    ].includes(accountType)
  ) {
    return {
      error:
        "Select a valid bank account type.",
    };
  }

  return {
    submission: {
      payoutMethod,
      accountHolderName,
      accountNumber,

      accountNumberLast4:
        accountNumber.slice(-4),

      ifsc,
      bankName,
      branchName,
      accountType,
    },
  };
};

/* =====================================
   Database helpers
===================================== */

const findInternalPayoutAccountByOwner =
  async (ownerId) => {
    return OwnerPayoutAccount.findOne({
      owner: ownerId,
    }).select(
      payoutAccountInternalFields
    );
  };

const findInternalPayoutAccountById =
  async (id) => {
    return OwnerPayoutAccount.findById(
      id
    ).select(
      payoutAccountInternalFields
    );
  };

const addHistory = ({
  payoutAccount,
  action,
  status,
  note,
  changedBy,
}) => {
  payoutAccount
    .verificationHistory
    .push({
      action,
      status,

      note:
        normalizeText(note),

      changedBy:
        changedBy || null,

      changedAt:
        new Date(),
    });
};

const saveProviderFailure =
  async (
    payoutAccount,
    error
  ) => {
    payoutAccount
      .razorpay
      .providerStatus =
      "failed";

    payoutAccount
      .razorpay
      .providerError =
      normalizeText(
        error.message
      ).slice(0, 1000);

    payoutAccount
      .razorpay
      .lastProviderSyncAt =
      new Date();

    payoutAccount
      .payoutsEnabled =
      false;

    await payoutAccount
      .save()
      .catch((saveError) => {
        console.error(
          "Save payout provider failure error:",
          saveError.message
        );
      });
  };

const sendControllerError = ({
  res,
  error,
  operation,
  fallbackMessage,
}) => {
  console.error(
    `${operation}:`,
    error.message
  );

  if (
    error.name ===
    "ValidationError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        Object.values(
          error.errors
        )[0]?.message ||
        "Payout-account validation failed.",
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,

      message:
        "A payout account already exists for this owner.",
    });
  }

  return res.status(500).json({
    success: false,
    message:
      fallbackMessage,
  });
};

/* =====================================
   Get logged-in owner's payout account

   GET /api/payout-accounts/me
   Owner
===================================== */

export const getMyPayoutAccount =
  async (req, res) => {
    try {
      const ownerId =
        getUserId(req);

      const payoutAccount =
        await OwnerPayoutAccount.findOne(
          {
            owner: ownerId,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          providerConfigured:
            isProviderConfigured(),

          payoutAccount:
            payoutAccount
              ? payoutAccount
                  .getSafeDetails()
              : null,
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Get owner payout account error",

        fallbackMessage:
          "Unable to load your payout account.",
      });
    }
  };

/* =====================================
   Submit or replace payout account

   POST /api/payout-accounts
   Owner
===================================== */

export const submitPayoutAccount =
  async (req, res) => {
    let payoutAccount = null;

    try {
      const ownerId =
        getUserId(req);

      if (
        !isProviderConfigured()
      ) {
        return res
          .status(503)
          .json({
            success: false,

            message:
              "Owner payouts are not configured yet. Add the RazorpayX credentials to the backend environment.",
          });
      }

      const {
        submission,

        error:
          validationError,
      } =
        validateSubmission(
          req.body
        );

      if (validationError) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              validationError,
          });
      }

      payoutAccount =
        await findInternalPayoutAccountByOwner(
          ownerId
        );

      const isReplacement =
        Boolean(
          payoutAccount
            ?.submittedAt
        );

      if (
        payoutAccount
          ?.verificationStatus ===
          "verified" &&
        req.body
          .replaceExisting !==
          true
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Your payout account is already verified. Confirm that you want to replace it.",

            requiresReplacementConfirmation:
              true,
          });
      }

      if (!payoutAccount) {
        payoutAccount =
          new OwnerPayoutAccount(
            {
              owner:
                ownerId,
            }
          );
      }

      payoutAccount
        .payoutMethod =
        submission.payoutMethod;

      payoutAccount
        .verificationStatus =
        "not_submitted";

      payoutAccount
        .payoutsEnabled =
        false;

      payoutAccount.reviewedAt =
        null;

      payoutAccount.reviewedBy =
        null;

      payoutAccount.verifiedAt =
        null;

      payoutAccount.rejectedAt =
        null;

      payoutAccount.rejectionReason =
        "";

      payoutAccount.adminNote =
        "";

      payoutAccount.verificationReference =
        "";

      if (
        submission.payoutMethod ===
        "bank_account"
      ) {
        payoutAccount.bankDetails =
          {
            accountHolderName:
              submission
                .accountHolderName,

            accountNumberLast4:
              submission
                .accountNumberLast4,

            ifsc:
              submission.ifsc,

            bankName:
              submission.bankName,

            branchName:
              submission
                .branchName,

            accountType:
              submission
                .accountType,
          };

        payoutAccount.upiDetails =
          undefined;
      } else {
        payoutAccount.upiDetails =
          {
            maskedVpa:
              submission
                .maskedVpa,
          };

        payoutAccount.bankDetails =
          undefined;
      }

      if (
        !payoutAccount
          .razorpay
          .contactId
      ) {
        const contact =
          await createRazorpayContact(
            {
              ownerId,
              user: req.user,
            }
          );

        payoutAccount
          .razorpay
          .contactId =
          contact.id;

        payoutAccount
          .razorpay
          .providerReference =
          contact.reference_id ||
          "";

        payoutAccount
          .razorpay
          .providerStatus =
          "created";

        payoutAccount
          .razorpay
          .providerError =
          "";

        payoutAccount
          .razorpay
          .lastProviderSyncAt =
          new Date();

        addHistory({
          payoutAccount,

          action:
            "provider_created",

          status:
            "not_submitted",

          note:
            "Razorpay payout contact created.",

          changedBy:
            ownerId,
        });

        await payoutAccount.save();
      }

      const fundAccount =
        await createRazorpayFundAccount(
          {
            contactId:
              payoutAccount
                .razorpay
                .contactId,

            submission,
          }
        );

      payoutAccount
        .razorpay
        .fundAccountId =
        fundAccount.id;

      payoutAccount
        .razorpay
        .providerStatus =
        "verification_pending";

      payoutAccount
        .razorpay
        .providerError =
        "";

      payoutAccount
        .razorpay
        .lastProviderSyncAt =
        new Date();

      if (
        submission.payoutMethod ===
          "bank_account" &&
        fundAccount
          .bank_account
          ?.bank_name
      ) {
        payoutAccount
          .bankDetails
          .bankName =
          fundAccount
            .bank_account
            .bank_name;
      }

      payoutAccount.verificationStatus =
        "pending";

      payoutAccount.submittedAt =
        new Date();

      addHistory({
        payoutAccount,

        action:
          isReplacement
            ? "resubmitted"
            : "submitted",

        status: "pending",

        note:
          isReplacement
            ? "Owner submitted replacement payout details."
            : "Owner submitted payout details for verification.",

        changedBy:
          ownerId,
      });

      await payoutAccount.save();

      return res
        .status(
          isReplacement
            ? 200
            : 201
        )
        .json({
          success: true,

          message:
            isReplacement
              ? "Payout account resubmitted successfully and is waiting for verification."
              : "Payout account submitted successfully and is waiting for verification.",

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      if (
        payoutAccount &&
        error.isProviderError
      ) {
        await saveProviderFailure(
          payoutAccount,
          error
        );

        return res
          .status(
            error.status ===
              503
              ? 503
              : 502
          )
          .json({
            success: false,

            message:
              "Unable to register the payout account with Razorpay. No complete bank account or UPI details were stored by HHS.",
          });
      }

      return sendControllerError({
        res,
        error,

        operation:
          "Submit payout account error",

        fallbackMessage:
          "Unable to submit your payout account.",
      });
    }
  };

/* =====================================
   Disable owner's own payout account

   PATCH /api/payout-accounts/me/disable
   Owner
===================================== */

export const disableMyPayoutAccount =
  async (req, res) => {
    try {
      const ownerId =
        getUserId(req);

      const payoutAccount =
        await findInternalPayoutAccountByOwner(
          ownerId
        );

      if (!payoutAccount) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Payout account not found.",
          });
      }

      payoutAccount.verificationStatus =
        "disabled";

      payoutAccount.payoutsEnabled =
        false;

      addHistory({
        payoutAccount,

        action: "disabled",
        status: "disabled",

        note:
          normalizeText(
            req.body.note
          ) ||
          "Payout account disabled by owner.",

        changedBy:
          ownerId,
      });

      await payoutAccount.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Payout account disabled successfully.",

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Disable owner payout account error",

        fallbackMessage:
          "Unable to disable your payout account.",
      });
    }
  };

/* =====================================
   List payout accounts for admin

   GET /api/payout-accounts/admin
   Finance Manager / Super Admin
===================================== */

export const getAdminPayoutAccounts =
  async (req, res) => {
    try {
      const {
        status = "",
        method = "",
        search = "",
        page = 1,
        limit = 20,
      } = req.query;

      const filter = {};

      if (status) {
        filter.verificationStatus =
          status;
      }

      if (method) {
        filter.payoutMethod =
          method;
      }

      if (
        normalizeText(
          search
        )
      ) {
        const searchExpression =
          {
            $regex:
              normalizeText(
                search
              ),

            $options: "i",
          };

        filter.$or = [
          {
            "bankDetails.accountHolderName":
              searchExpression,
          },

          {
            "bankDetails.bankName":
              searchExpression,
          },

          {
            "bankDetails.ifsc":
              searchExpression,
          },

          {
            "bankDetails.accountNumberLast4":
              searchExpression,
          },

          {
            "upiDetails.maskedVpa":
              searchExpression,
          },

          {
            verificationReference:
              searchExpression,
          },
        ];
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const pageSize =
        Math.min(
          Math.max(
            Number(limit) ||
              20,
            1
          ),
          100
        );

      const skip =
        (currentPage - 1) *
        pageSize;

      const [
        payoutAccounts,
        totalAccounts,
      ] =
        await Promise.all([
          OwnerPayoutAccount.find(
            filter
          )
            .populate(
              "owner",
              "fullName email phone role isActive"
            )
            .populate(
              "reviewedBy",
              "fullName email role"
            )
            .sort({
              submittedAt: -1,
              createdAt: -1,
            })
            .skip(skip)
            .limit(pageSize),

          OwnerPayoutAccount.countDocuments(
            filter
          ),
        ]);

      return res
        .status(200)
        .json({
          success: true,

          payoutAccounts:
            payoutAccounts.map(
              (account) => {
                return account
                  .getSafeDetails();
              }
            ),

          pagination: {
            currentPage,

            totalPages:
              Math.ceil(
                totalAccounts /
                pageSize
              ),

            totalAccounts,
            pageSize,

            hasNextPage:
              currentPage *
                pageSize <
              totalAccounts,

            hasPreviousPage:
              currentPage > 1,
          },
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Get admin payout accounts error",

        fallbackMessage:
          "Unable to load owner payout accounts.",
      });
    }
  };

/* =====================================
   Get individual payout account

   GET /api/payout-accounts/admin/:id
   Finance Manager / Super Admin
===================================== */

export const getAdminPayoutAccountById =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid payout account ID.",
          });
      }

      const payoutAccount =
        await OwnerPayoutAccount.findById(
          id
        )
          .populate(
            "owner",
            "fullName email phone role isActive"
          )
          .populate(
            "reviewedBy",
            "fullName email role"
          )
          .populate(
            "verificationHistory.changedBy",
            "fullName email role"
          );

      if (!payoutAccount) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Payout account not found.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Get payout account details error",

        fallbackMessage:
          "Unable to load the payout account.",
      });
    }
  };

/* =====================================
   Mark payout account under review

   PATCH /api/payout-accounts/admin/:id/review
   Finance Manager / Super Admin
===================================== */

export const markPayoutAccountUnderReview =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const reviewerId =
        getUserId(req);

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid payout account ID.",
          });
      }

      const payoutAccount =
        await findInternalPayoutAccountById(
          id
        );

      if (!payoutAccount) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Payout account not found.",
          });
      }

      if (
        payoutAccount
          .verificationStatus !==
        "pending"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Only pending payout accounts can be moved under review.",
          });
      }

      payoutAccount.verificationStatus =
        "under_review";

      payoutAccount.reviewedBy =
        reviewerId;

      payoutAccount.adminNote =
        normalizeText(
          req.body.note
        );

      addHistory({
        payoutAccount,

        action:
          "under_review",

        status:
          "under_review",

        note:
          payoutAccount
            .adminNote ||
          "Payout account review started.",

        changedBy:
          reviewerId,
      });

      await payoutAccount.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Payout account moved under review.",

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Review payout account error",

        fallbackMessage:
          "Unable to update the payout-account review status.",
      });
    }
  };

/* =====================================
   Approve payout account

   PATCH /api/payout-accounts/admin/:id/approve
   Finance Manager / Super Admin
===================================== */

export const approvePayoutAccount =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const reviewerId =
        getUserId(req);

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid payout account ID.",
          });
      }

      const payoutAccount =
        await findInternalPayoutAccountById(
          id
        );

      if (!payoutAccount) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Payout account not found.",
          });
      }

      if (
        ![
          "pending",
          "under_review",
        ].includes(
          payoutAccount
            .verificationStatus
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "This payout account cannot be approved from its current status.",
          });
      }

      if (
        !payoutAccount
          .razorpay
          .fundAccountId
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "The Razorpay fund account has not been created. This payout account cannot be approved.",
          });
      }

      const note =
        normalizeText(
          req.body.note
        );

      const verificationReference =
        normalizeText(
          req.body
            .verificationReference
        );

      payoutAccount.verificationStatus =
        "verified";

      payoutAccount.payoutsEnabled =
        true;

      payoutAccount.reviewedBy =
        reviewerId;

      payoutAccount.adminNote =
        note;

      payoutAccount.verificationReference =
        verificationReference;

      payoutAccount
        .razorpay
        .providerStatus =
        "activated";

      payoutAccount
        .razorpay
        .providerError =
        "";

      payoutAccount
        .razorpay
        .lastProviderSyncAt =
        new Date();

      addHistory({
        payoutAccount,

        action: "verified",
        status: "verified",

        note:
          note ||
          "Payout account verified by administrator.",

        changedBy:
          reviewerId,
      });

      await payoutAccount.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Payout account verified successfully.",

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Approve payout account error",

        fallbackMessage:
          "Unable to approve the payout account.",
      });
    }
  };

/* =====================================
   Reject payout account

   PATCH /api/payout-accounts/admin/:id/reject
   Finance Manager / Super Admin
===================================== */

export const rejectPayoutAccount =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const reviewerId =
        getUserId(req);

      const reason =
        normalizeText(
          req.body.reason
        );

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid payout account ID.",
          });
      }

      if (!reason) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A rejection reason is required.",
          });
      }

      const payoutAccount =
        await findInternalPayoutAccountById(
          id
        );

      if (!payoutAccount) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Payout account not found.",
          });
      }

      if (
        ![
          "pending",
          "under_review",
          "verified",
        ].includes(
          payoutAccount
            .verificationStatus
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "This payout account cannot be rejected from its current status.",
          });
      }

      payoutAccount.verificationStatus =
        "rejected";

      payoutAccount.payoutsEnabled =
        false;

      payoutAccount.reviewedBy =
        reviewerId;

      payoutAccount.rejectionReason =
        reason;

      payoutAccount.adminNote =
        normalizeText(
          req.body.note
        );

      addHistory({
        payoutAccount,

        action: "rejected",
        status: "rejected",
        note: reason,

        changedBy:
          reviewerId,
      });

      await payoutAccount.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Payout account rejected successfully.",

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Reject payout account error",

        fallbackMessage:
          "Unable to reject the payout account.",
      });
    }
  };

/* =====================================
   Disable payout account by admin

   PATCH /api/payout-accounts/admin/:id/disable
   Finance Manager / Super Admin
===================================== */

export const disablePayoutAccount =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const reviewerId =
        getUserId(req);

      const note =
        normalizeText(
          req.body.note
        );

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid payout account ID.",
          });
      }

      if (!note) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please provide a reason for disabling the payout account.",
          });
      }

      const payoutAccount =
        await findInternalPayoutAccountById(
          id
        );

      if (!payoutAccount) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Payout account not found.",
          });
      }

      payoutAccount.verificationStatus =
        "disabled";

      payoutAccount.payoutsEnabled =
        false;

      payoutAccount.reviewedBy =
        reviewerId;

      payoutAccount.adminNote =
        note;

      payoutAccount
        .razorpay
        .providerStatus =
        "suspended";

      addHistory({
        payoutAccount,

        action: "disabled",
        status: "disabled",
        note,

        changedBy:
          reviewerId,
      });

      await payoutAccount.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Payout account disabled successfully.",

          payoutAccount:
            payoutAccount
              .getSafeDetails(),
        });
    } catch (error) {
      return sendControllerError({
        res,
        error,

        operation:
          "Disable payout account error",

        fallbackMessage:
          "Unable to disable the payout account.",
      });
    }
  };