//
//  SignInView.swift
//  GraceChords Studio
//
//  Email + password against an existing GraceChords account. No sign-up, no
//  password reset, no Apple/Google — those live in the mobile app.
//

import SwiftUI

struct SignInView: View {
    @ObservedObject var auth: AuthController

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: GCSpacing.lg) {
            VStack(spacing: GCSpacing.xs) {
                Text("GraceChords Studio")
                    .gcTextStyle(.largeTitle)
                    .foregroundStyle(GCColor.ink)
                Text("Sign in with your GraceChords account")
                    .gcTextStyle(.body)
                    .foregroundStyle(GCColor.sec)
            }

            VStack(spacing: GCSpacing.sm) {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .disableAutocorrection(true)
                SecureField("Password", text: $password)
                    .textContentType(.password)
            }
            .textFieldStyle(.roundedBorder)
            .onSubmit(submit)

            if let errorText = auth.errorText {
                Text(errorText)
                    .gcTextStyle(.body)
                    .foregroundStyle(GCColor.danger)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button(action: submit) {
                if auth.isWorking {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Sign In")
                }
            }
            .keyboardShortcut(.defaultAction)
            .disabled(auth.isWorking || email.isEmpty || password.isEmpty)
        }
        // MaxWidth.form is the token cap the mobile auth screen uses; the window's
        // 420pt floor means it rarely binds, but it keeps the column from
        // stretching when the sign-in view is shown in a resized window.
        .frame(maxWidth: GCLayout.MaxWidth.form)
        .padding(GCSpacing.xxl)
        .frame(minWidth: 420, minHeight: 320)
    }

    private func submit() {
        guard !auth.isWorking else { return }
        Task { await auth.signIn(email: email, password: password) }
    }
}
