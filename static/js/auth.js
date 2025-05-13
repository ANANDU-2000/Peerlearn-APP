/**
 * Authentication and registration form handling for PeerLearn
 */

document.addEventListener('DOMContentLoaded', function() {
  // Learner signup form functionality
  window.signupForm = function() {
    return {
      currentStep: 1,
      isStepValid: false,
      previewUrl: null,
      formData: {
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password1: '',
        password2: '',
        interests: '',
        career_goal: '',
        bio: ''
      },
      popularCategories: [
        'Programming', 'Web Development', 'Data Science', 'Design', 'Business', 
        'Marketing', 'Mathematics', 'Science', 'Languages', 'Music'
      ],
      
      initForm() {
        // Form initialization happens in the template with Django template tags
        this.validateStep1();
      },
      
      nextStep() {
        if (this.isStepValid) {
          this.currentStep++;
          this.validateCurrentStep();
        }
      },
      
      prevStep() {
        if (this.currentStep > 1) {
          this.currentStep--;
          this.validateCurrentStep();
        }
      },
      
      validateCurrentStep() {
        switch(this.currentStep) {
          case 1: this.validateStep1(); break;
          case 2: this.validateStep2(); break;
          case 3: this.validateStep3(); break;
          case 4: this.isStepValid = true; break;
        }
      },
      
      validateStep1() {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const usernameRegex = /^[a-zA-Z0-9@.+_-]+$/;
        
        const isEmailValid = emailRegex.test(this.formData.email);
        const isUsernameValid = usernameRegex.test(this.formData.username) && this.formData.username.length <= 150;
        const isPasswordValid = this.formData.password1.length >= 8;
        const doPasswordsMatch = this.formData.password1 === this.formData.password2;
        
        this.isStepValid = isEmailValid && isUsernameValid && isPasswordValid && doPasswordsMatch;
      },
      
      validateStep2() {
        this.isStepValid = this.formData.interests.trim().length > 0;
      },
      
      validateStep3() {
        this.isStepValid = this.formData.career_goal.trim().length > 0;
      },
      
      handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.previewUrl = e.target.result;
          };
          reader.readAsDataURL(file);
        }
      },
      
      isInterestSelected(category) {
        const interests = this.formData.interests.split(',').map(item => item.trim());
        return interests.includes(category);
      },
      
      toggleInterest(category) {
        const interests = this.formData.interests.split(',').map(item => item.trim()).filter(item => item !== '');
        
        if (this.isInterestSelected(category)) {
          // Remove the category
          const index = interests.indexOf(category);
          if (index !== -1) {
            interests.splice(index, 1);
          }
        } else {
          // Add the category
          interests.push(category);
        }
        
        this.formData.interests = interests.join(', ');
        this.validateStep2();
      }
    };
  };
  
  // Mentor signup form functionality
  window.mentorSignupForm = function() {
    return {
      currentStep: 1,
      isStepValid: false,
      previewUrl: null,
      formData: {
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password1: '',
        password2: '',
        expertise: '',
        skills: '',
        phone_number: '',
        bio: '',
        intro_video: ''
      },
      popularDomains: [
        'Programming', 'Web Development', 'Data Science', 'Design', 'Business', 
        'Marketing', 'Mathematics', 'Science', 'Languages', 'Music'
      ],
      
      initForm() {
        // Form initialization happens in the template with Django template tags
        this.validateStep1();
      },
      
      nextStep() {
        if (this.isStepValid) {
          this.currentStep++;
          this.validateCurrentStep();
        }
      },
      
      prevStep() {
        if (this.currentStep > 1) {
          this.currentStep--;
          this.validateCurrentStep();
        }
      },
      
      validateCurrentStep() {
        switch(this.currentStep) {
          case 1: this.validateStep1(); break;
          case 2: this.validateStep2(); break;
          case 3: this.validateStep3(); break;
          case 4: this.validateStep4(); break;
          case 5: this.isStepValid = true; break;
        }
      },
      
      validateStep1() {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const usernameRegex = /^[a-zA-Z0-9@.+_-]+$/;
        
        const isEmailValid = emailRegex.test(this.formData.email);
        const isUsernameValid = usernameRegex.test(this.formData.username) && this.formData.username.length <= 150;
        const isPasswordValid = this.formData.password1.length >= 8;
        const doPasswordsMatch = this.formData.password1 === this.formData.password2;
        
        this.isStepValid = isEmailValid && isUsernameValid && isPasswordValid && doPasswordsMatch;
      },
      
      validateStep2() {
        this.isStepValid = this.formData.expertise.trim().length > 0;
      },
      
      validateStep3() {
        this.isStepValid = this.formData.skills.trim().length > 0;
      },
      
      validateStep4() {
        this.isStepValid = this.formData.bio.trim().length > 0;
      },
      
      handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.previewUrl = e.target.result;
          };
          reader.readAsDataURL(file);
        }
      },
      
      isDomainSelected(domain) {
        const expertise = this.formData.expertise.split(',').map(item => item.trim());
        return expertise.includes(domain);
      },
      
      toggleDomain(domain) {
        const expertise = this.formData.expertise.split(',').map(item => item.trim()).filter(item => item !== '');
        
        if (this.isDomainSelected(domain)) {
          // Remove the domain
          const index = expertise.indexOf(domain);
          if (index !== -1) {
            expertise.splice(index, 1);
          }
        } else {
          // Add the domain
          expertise.push(domain);
        }
        
        this.formData.expertise = expertise.join(', ');
        this.validateStep2();
      }
    };
  };
});