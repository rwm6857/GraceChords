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
        VStack(spacing: 16) {
            VStack(spacing: 4) {
                Text("GraceChords Studio")
                    .font(.title2.weight(.semibold))
                Text("Sign in with your GraceChords account")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 10) {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .disableAutocorrection(true)
                SecureField("Password", text: $password)
                    .textContentType(.password)
            }
            .textFieldStyle(.roundedBorder)
            .frame(maxWidth: 320)
            .onSubmit(submit)

            if let errorText = auth.errorText {
                Text(errorText)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)
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
        .padding(32)
        .frame(minWidth: 420, minHeight: 320)
    }

    private func submit() {
        guard !auth.isWorking else { return }
        Task { await auth.signIn(email: email, password: password) }
    }
}
