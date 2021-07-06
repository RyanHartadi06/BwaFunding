<!-- popularCauses section -->
<section id="popularcause" class="bg-gray waypoint-tigger xs-section-padding">
  <div class="container">
    <div class="xs-heading row xs-mb-60">
      <div class="col-md-9 col-xl-9">
        <h2 class="xs-title">Popular Causes</h2>
        <span class="xs-separetor dashed" />
        <p>
          FundPress has built a platform focused on aiding entrepreneurs,
          startups, and <br /> companies raise capital from anyone.
        </p>
      </div>
      <!-- .xs-heading-title END -->
    </div>
    <!-- .row end -->
    <div class="row">
      <div class="col-lg-4 col-md-6">
        <!-- modal goes here -->
        <!-- Modal -->
        <div
          class="modal fade"
          id="exampleModal"
          tabindex="-1"
          role="dialog"
          aria-labelledby="exampleModalLabel"
          aria-hidden="true"
        >
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="exampleModalLabel">
                  Splash Drone 3 a Fully Waterproof Drone that floats
                </h5>
                <button
                  type="button"
                  class="close"
                  data-dismiss="modal"
                  aria-label="Close"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <form>
                  <div class="form-group">
                    <label for="exampleInputAmount">Amount donation</label>
                    <input
                      required
                      type="number"
                      class="form-control"
                      id="exampleInputAmount"
                      aria-describedby="amountHelp"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div class="form-group">
                    <label for="exampleInputName">Your name</label>
                    <input
                      required
                      type="text"
                      class="form-control"
                      id="exampleInputName"
                      aria-describedby="nameHelp"
                      placeholder="Enter full name"
                    />
                  </div>
                  <div class="form-group">
                    <label for="exampleInputEmail1">Email address</label>
                    <input
                      required
                      type="email"
                      class="form-control"
                      id="exampleInputEmail1"
                      aria-describedby="emailHelp"
                      placeholder="Enter email"
                    />
                  </div>
                  <div class="form-check">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      id="exampleCheck1"
                    />
                    <label class="form-check-label" for="exampleCheck1"
                      >I Agree</label
                    >
                  </div>
                </form>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-primary">Continue</button>
              </div>
            </div>
          </div>
        </div>
        <div class="xs-popular-item xs-box-shadow">
          <div class="xs-item-header">
            <img src="assets/images/causes/causes_4.png" alt="" />

            <div class="xs-skill-bar">
              <div class="xs-skill-track">
                <p>
                  <span
                    class="number-percentage-count number-percentage"
                    data-value="90"
                    data-animation-duration="3500">0</span
                  >%
                </p>
              </div>
            </div>
          </div>
          <!-- .xs-item-header END -->
          <div class="xs-item-content">
            <ul class="xs-simple-tag xs-mb-20">
              <li><a href="">Food</a></li>
            </ul>

            <a href="#" class="xs-post-title xs-mb-30"
              >Splash Drone 3 a Fully Waterproof Drone that floats</a
            >

            <ul class="xs-list-with-content">
              <li>$67,000<span>Pledged</span></li>
              <li>
                <span
                  class="number-percentage-count number-percentage"
                  data-value="90"
                  data-animation-duration="3500">0</span
                >% <span>Funded</span>
              </li>
              <li>3<span>Days to go</span></li>
            </ul>

            <span class="xs-separetor" />

            <div class="row xs-margin-0">
              <div class="xs-round-avatar">
                <img src="assets/images/avatar/avatar_1.jpg" alt="" />
              </div>
              <div class="xs-avatar-title">
                <a href="#"><span>By</span>Ema Watson</a>
              </div>
            </div>

            <span class="xs-separetor" />

            <a
              href="#"
              data-toggle="modal"
              data-target="#exampleModal"
              class="btn btn-primary btn-block"
            >
              Donate This Cause
            </a>
          </div>
          <!-- .xs-item-content END -->
        </div>
        <!-- .xs-popular-item END -->
      </div>
    </div>
    <!-- .row end -->
  </div>
  <!-- .container end -->
</section>
<!-- End popularCauses section -->

<!-- <script>
  export let charities;
</script>

<div>
  <h2>Daftar Charity</h2>
  {#if charities !== undefined}
    <ul>
      {#each charities as charity}
        <li>{charity.title} - {charity.category}</li>
      {/each}
    </ul>
  {:else}
    <h5>Data Belum Tersedia</h5>
  {/if}
</div> -->
